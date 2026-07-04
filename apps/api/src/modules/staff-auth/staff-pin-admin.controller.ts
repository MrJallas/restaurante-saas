import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { StaffAuthService } from './staff-auth.service';

/**
 * Rota ADMIN de PIN (TROCAR-PIN, decisão Caleb 2026-07-04) — gerente reseta
 * o PIN de um funcionário que esqueceu o dele (fluxo presencial: o gerente
 * fala o PIN temporário; o login força a troca via must_change_pin).
 *
 * Vive no módulo staff-auth (a lógica de PIN/sessão é daqui), mas atende em
 * `/:slug/staff/:staffId/reset-pin` — o shape RESTful do recurso staff. Não
 * colide com o StaffController: Nest casa rotas por path registrado, não
 * por controller.
 *
 * Guards do common/guards (usados, NÃO modificados): StaffOnlyGuard valida
 * o portão de equipe; ManagerOnlyGuard confere o role ATIVO no DB a partir
 * do x-staff-token — waiter/host/cook não resetam ninguém.
 */
@Controller(':slug/staff')
export class StaffPinAdminController {
  constructor(private readonly staffAuth: StaffAuthService) {}

  @Post(':staffId/reset-pin')
  @HttpCode(200)
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  resetPin(@Param('staffId') staffId: string) {
    return this.staffAuth.managerResetPin(staffId);
  }
}
