import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Query,
  Req,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';
import { RedisService } from '../../infra/redis/redis.service';
import { throttleClientIp } from '../../common/utils/throttle-client-ip';
import { MenuService } from './menu.service';

// Round 16 (B-NEW-52): rate-limit /search por IP — ILIKE em menu_items
// é caro pra DB; sem throttle um attacker autenticado scaneia o menu
// inteiro fazendo ?q=a, ?q=b, etc. 30 buscas em 60s é folgado pra UX
// real (digitação) mas mata script kiddie.
const SEARCH_RATE_MAX = 30;
const SEARCH_RATE_WINDOW_SECONDS = 60;

@Controller(':slug/menu')
export class MenuController {
  constructor(
    private readonly menuService: MenuService,
    private readonly redis: RedisService,
  ) {}

  @Get('categories')
  @UseGuards(StaffOrSessionGuard)
  async getCategories() {
    const categories = await this.menuService.getCategories();
    return { categories };
  }

  @Get('items')
  @UseGuards(StaffOrSessionGuard)
  async getItems(@Query('categoryId') categoryId?: string) {
    const items = await this.menuService.getItems(categoryId);
    return { items };
  }

  @Get('items/:id')
  @UseGuards(StaffOrSessionGuard)
  async getItemById(@Param('id') id: string) {
    const item = await this.menuService.getItemById(id);
    if (!item) {
      throw new NotFoundException('Item nao encontrado.');
    }
    return item;
  }

  /**
   * Round 16 (B-NEW-52):
   * - Cap em 50 chars no query (era unbounded — `?q=<10kb-string>` ia
   *   pro Postgres ILIKE devorando CPU).
   * - Rate-limit IP: 30 buscas por 60s. Stub UX é instantâneo, só
   *   bloqueia abuse.
   */
  @Get('search')
  @UseGuards(StaffOrSessionGuard)
  async search(
    @Query('q') query: string,
    @Req() req: { ip?: string; socket?: { remoteAddress?: string } },
  ) {
    if (!query || query.trim().length < 2) {
      return { items: [] };
    }
    const trimmed = query.trim();
    if (trimmed.length > 50) {
      throw new HttpException('Busca muito longa. Use até 50 caracteres.', HttpStatus.BAD_REQUEST);
    }

    await this.assertSearchRateLimit(this.searchClientKey(req));

    const items = await this.menuService.search(trimmed);
    return { items };
  }

  @Get('featured')
  @UseGuards(StaffOrSessionGuard)
  async getFeatured() {
    const items = await this.menuService.getFeatured();
    return { items };
  }

  private searchClientKey(req: { ip?: string; socket?: { remoteAddress?: string } }): string {
    // P1 OWASP API4: IP real do peer TCP, não XFF forjável (defense-in-depth
    // — mesma disciplina do customers.identify). Sem isso o atacante rotaciona
    // o header e scaneia o menu inteiro burlando o limite de 30/60s.
    return `menu:search:${throttleClientIp(req)}`;
  }

  private async assertSearchRateLimit(ipKey: string): Promise<void> {
    const attempts = await this.redis.incr(ipKey);
    if (attempts === 1) {
      await this.redis.expire(ipKey, SEARCH_RATE_WINDOW_SECONDS);
    }
    if (attempts > SEARCH_RATE_MAX) {
      throw new HttpException(
        'Muitas buscas. Tente novamente em alguns segundos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
