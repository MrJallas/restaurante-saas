import { Controller, Get, Param, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { SessionGuard } from '../../common/guards/session.guard';
import { MenuService } from './menu.service';

@Controller(':slug/menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get('categories')
  @UseGuards(SessionGuard)
  async getCategories() {
    const categories = await this.menuService.getCategories();
    return { categories };
  }

  @Get('items')
  @UseGuards(SessionGuard)
  async getItems(@Query('categoryId') categoryId?: string) {
    const items = await this.menuService.getItems(categoryId);
    return { items };
  }

  @Get('items/:id')
  @UseGuards(SessionGuard)
  async getItemById(@Param('id') id: string) {
    const item = await this.menuService.getItemById(id);
    if (!item) {
      throw new NotFoundException('Item nao encontrado.');
    }
    return item;
  }

  @Get('search')
  @UseGuards(SessionGuard)
  async search(@Query('q') query: string) {
    if (!query || query.trim().length < 2) {
      return { items: [] };
    }
    const items = await this.menuService.search(query.trim());
    return { items };
  }

  @Get('featured')
  @UseGuards(SessionGuard)
  async getFeatured() {
    const items = await this.menuService.getFeatured();
    return { items };
  }
}
