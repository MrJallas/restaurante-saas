import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsIn, IsOptional } from 'class-validator';
import { HostOrManagerGuard } from '../../common/guards/host-only.guard';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import {
  CreateReservationDto,
  CreateSwapDto,
  CreateWaitlistDto,
  LiberateTableDto,
  ToggleVipDto,
  UpdateReservationDto,
  UpdateSwapDto,
} from './dto/host.dto';
import { HostService } from './host.service';

class WaitlistRemoveQueryDto {
  @IsOptional()
  @IsIn(['seated', 'left'])
  transition?: 'seated' | 'left';
}

class SwapListQueryDto {
  @IsOptional()
  @IsIn(['requested', 'in_progress', 'completed', 'cancelled'])
  status?: 'requested' | 'in_progress' | 'completed' | 'cancelled';
}

/**
 * Staff-host controller · per docs/features/customer-host-model.md (V16) +
 * `apps/web-staff/src/screens/host/*`. Cobre TODAS as rotas que estavam
 * caindo em 404 (P0 #11): mapa, inbox, liberate, swap, vip via TableMenu,
 * waitlist e reservations.
 *
 * Auth: `StaffOnlyGuard` valida o `x-staff-key`; `HostOrManagerGuard`
 * exige que o role seja `host` ou `manager`. Manager tambem pode operar
 * essas rotas (cobertura de turno em que a recepcionista nao esta).
 */
@Controller(':slug/host')
@UseGuards(StaffOnlyGuard, HostOrManagerGuard)
export class HostController {
  constructor(
    private readonly service: HostService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  // ─── Mapa / table layout ───
  @Get('tables')
  async listTables() {
    return this.service.listTables();
  }

  // ─── Inbox ───
  @Get('inbox')
  async inbox() {
    return this.service.listInbox();
  }

  // ─── Liberate ───
  /**
   * Round 11 (B-NEW-56): staffId derivado do x-staff-id header em todos
   * endpoints staff-side do host module. Antes: dto.staffId arbitrário
   * permitia manager M registrar liberateTable como waiter W (audit
   * spoof). HostOrManagerGuard já valida role+DB no header.
   */
  @Post('tables/:tableNumber/liberate')
  async liberate(
    @Param('slug') slug: string,
    @Param('tableNumber', ParseIntPipe) tableNumber: number,
    @Body() body: LiberateTableDto,
    @Req() req: Request,
  ) {
    const staffId = this.callerResolver.requireStaffId(req);
    return this.service.liberateTable(tableNumber, { ...body, staffId }, slug);
  }

  // ─── VIP via TableMenu ───
  @Post('tables/:tableNumber/vip')
  async vip(
    @Param('slug') slug: string,
    @Param('tableNumber', ParseIntPipe) tableNumber: number,
    @Body() body: ToggleVipDto,
    @Req() req: Request,
  ) {
    const staffId = this.callerResolver.requireStaffId(req);
    return this.service.toggleVip(tableNumber, { ...body, staffId }, slug);
  }

  // ─── Swap ───
  @Get('swap-requests')
  async listSwap(@Query() q: SwapListQueryDto) {
    return this.service.listSwapRequests({ status: q.status });
  }

  @Post('swap-requests')
  async createSwap(
    @Param('slug') slug: string,
    @Body() body: CreateSwapDto,
    @Req() req: Request,
  ) {
    const staffId = this.callerResolver.requireStaffId(req);
    return this.service.createSwapRequest({ ...body, staffId }, slug);
  }

  @Patch('swap-requests/:id')
  async updateSwap(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() body: UpdateSwapDto,
    @Req() req: Request,
  ) {
    const staffId = this.callerResolver.requireStaffId(req);
    return this.service.updateSwapRequest(id, { ...body, staffId }, slug);
  }

  /**
   * Alias do FE legado (`POST /host/tables/swap`, body `{ fromTable, toTable
   * }`). Mantido pra que as 7 telas existentes continuem funcionando sem
   * alteracao no client. Termina em createSwapRequest e marca como
   * completed na hora — comportamento "swap atomico" que o FE antigo
   * espera.
   */
  @Post('tables/swap')
  async legacySwap(
    @Param('slug') slug: string,
    @Body() body: CreateSwapDto,
    @Req() req: Request,
  ) {
    const staffId = this.callerResolver.requireStaffId(req);
    const created = await this.service.createSwapRequest({ ...body, staffId }, slug);
    const finalized = await this.service.updateSwapRequest(
      created.id,
      { status: 'completed', staffId },
      slug,
    );
    return { ok: true as const, sessionId: finalized.sessionId };
  }

  // ─── Waitlist ───
  @Get('waitlist')
  async listWaitlist() {
    return this.service.listWaitlist();
  }

  @Post('waitlist')
  async addToWaitlist(@Body() body: CreateWaitlistDto) {
    return this.service.addToWaitlist(body);
  }

  @Delete('waitlist/:id')
  async removeFromWaitlist(
    @Param('id') id: string,
    @Query() q: WaitlistRemoveQueryDto,
  ) {
    return this.service.removeFromWaitlist(id, q.transition ?? 'left');
  }

  // ─── Reservations ───
  @Get('reservations')
  async listReservations() {
    return this.service.listReservations();
  }

  @Post('reservations')
  async createReservation(
    @Body() body: CreateReservationDto,
    @Req() req: Request,
  ) {
    const staffId = this.callerResolver.requireStaffId(req);
    return this.service.createReservation({ ...body, staffId });
  }

  @Patch('reservations/:id')
  async updateReservation(
    @Param('id') id: string,
    @Body() body: UpdateReservationDto,
  ) {
    return this.service.updateReservation(id, body);
  }
}
