import { Module } from '@nestjs/common';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { TenantModule } from '../tenant/tenant.module';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';

/**
 * Round 18 (Onda 2 backend): persistencia de turnos pra
 * ScreenManagerShiftEditor (canvas garcom-screens-c.jsx:1351). Migration
 * 043 cria tabelas staff_shifts + staff_shift_assignments. 5 endpoints:
 *   GET /shifts?date=          lista turnos do dia com members
 *   POST /shifts/assignments   add staff a turno
 *   PATCH /shifts/assignments/:id/move      muda staff de turno
 *   PATCH /shifts/assignments/:id/overtime  hora extra
 *   DELETE /shifts/assignments/:id          remove (soft-delete)
 *   POST /shifts/duplicate-week  copia escala fromDate->toDate
 */
@Module({
  imports: [TenantModule],
  controllers: [ShiftsController],
  providers: [ShiftsService, ManagerOnlyGuard],
  exports: [ShiftsService],
})
export class ShiftsModule {}
