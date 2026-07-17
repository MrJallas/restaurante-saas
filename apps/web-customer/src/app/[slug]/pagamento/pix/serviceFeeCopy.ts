export function serviceFeeCopy(serviceFeePct: number | null): string {
  if (serviceFeePct == null || !Number.isFinite(serviceFeePct)) {
    return 'taxa de serviço incluída';
  }
  if (serviceFeePct === 0) return 'sem taxa de serviço';
  return `inclui taxa ${String(serviceFeePct).replace('.', ',')}%`;
}
