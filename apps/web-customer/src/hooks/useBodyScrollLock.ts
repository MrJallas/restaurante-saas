'use client';

import { useEffect } from 'react';

/**
 * Lock body scroll quando uma sheet/overlay tá aberta. Restaura scroll
 * position quando fecha.
 *
 * **Por que não `overflow: hidden` simples:**
 * iOS Safari ignora `overflow: hidden` no body — único jeito de impedir
 * scroll é `position: fixed`. Mas isso "perde" a scroll position do
 * usuário, então precisamos salvar o `scrollY`, mover o body pra negative
 * top, e restaurar no cleanup.
 *
 * **Round 21 §H — bug do drawer hamburguer travando:**
 * Versão anterior fazia:
 * ```ts
 * const prev = { position: body.style.position, ... };
 * body.style.position = 'fixed';
 * // cleanup:
 * body.style.position = prev.position;  // ← pode ser ''
 * ```
 *
 * Quando duas sheets abriam em sequência (e.g. CallWaiterSheet → close →
 * MenuOverlay → close), o `prev` capturado pela 2ª sheet ainda continha
 * `position: 'fixed'` da 1ª (timing race), e o cleanup restaurava `fixed`
 * em vez de limpar. Body ficava preso, drawer hamburguer não subia, scroll
 * quebrava.
 *
 * Fix: contador global. Só limpa o lock quando o ÚLTIMO consumer fecha.
 * Cada chamada do hook que tá ativa incrementa o counter; cleanup decrementa;
 * quando counter chega a 0, restaura tudo.
 */

interface LockState {
  count: number;
  scrollY: number;
}

const lockState: LockState = {
  count: 0,
  scrollY: 0,
};

function applyLock() {
  if (typeof document === 'undefined') return;
  lockState.scrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${lockState.scrollY}px`;
  document.body.style.width = '100%';
  document.body.style.overflow = 'hidden';
}

function releaseLock() {
  if (typeof document === 'undefined') return;
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  document.body.style.overflow = '';
  window.scrollTo(0, lockState.scrollY);
}

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (lockState.count === 0) applyLock();
    lockState.count += 1;
    return () => {
      lockState.count -= 1;
      if (lockState.count <= 0) {
        lockState.count = 0;
        releaseLock();
      }
    };
  }, [active]);
}
