'use client';

// /manager/equipe/turnos — Onda 1C (round 18). ScreenManagerShiftEditor V8.
// `?expand=manha|tarde|noite|all` controla o card aberto inicial (default = noite).

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenManagerShiftEditor } from '../../../../screens/manager/ScreenManagerShiftEditor';

type ExpandKey = 'manha' | 'tarde' | 'noite' | 'all';

function ShiftEditorInner() {
  const params = useSearchParams();
  const dark = params.get('dark') === '1';
  const expandRaw = params.get('expand') as ExpandKey | null;
  const defaultExpanded: ExpandKey =
    expandRaw && ['manha', 'tarde', 'noite', 'all'].includes(expandRaw) ? expandRaw : 'noite';
  return <ScreenManagerShiftEditor dark={dark} defaultExpanded={defaultExpanded} />;
}

export default function ManagerShiftEditorPage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}
    >
      <ShiftEditorInner />
    </Suspense>
  );
}
