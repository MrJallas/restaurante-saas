/**
 * Animations module — Phase 3 (C1)
 * ────────────────────────────────────────────────────────────────────────
 * Catálogo central das animações que os primitivos novos compartilham com
 * as telas (C2/C3). Mantemos as keyframes propriamente ditas em
 * `apps/web-customer/src/app/globals.css` (Tailwind + iOS Safari pegam
 * as @keyframes globais sem custo de runtime), e aqui exportamos:
 *
 *   1. Constantes de duração / easing — `DOT_PULSE_MS`, etc. — pra que
 *      setTimeout/JS possa esperar pelo mesmo tempo da animação CSS sem
 *      duplicar magic numbers.
 *
 *   2. Classes Tailwind utilitárias — `animationClass.dotPulse`, etc. —
 *      pra que callsites façam `<div className={animationClass.dotPulse}>`
 *      em vez de copiar a string `animate-dot-pulse-stagger` em N lugares.
 *
 *   3. `useReducedMotion()` — hook pra desligar animações quando o usuário
 *      pediu via SO. Os primitivos consultam e devolvem string vazia em
 *      vez da animation class — fica accessibility-friendly out-of-the-box.
 *
 * Por que não framer-motion / styled-components? O app web-customer roda
 * em Safari iOS direto (não é PWA) e o time já decidiu manter Tailwind +
 * CSS keyframes (ver `globals.css` keyframes existentes — bounce-dot,
 * blink, pop-in...). Animações do compositor (transform/opacity) são
 * baratas no GPU; framer-motion adicionaria peso desnecessário aqui.
 */

import { useEffect, useState } from 'react';

// ─── Durations & easings ──────────────────────────────────────────────

/** Stagger entre os 3 dots do ToolCallIndicator (alinha cDotPulse 1.2s do canvas).
 * 1.4s casa com pulse-dot existente em globals.css; 0.16s entre dots dá o efeito
 * "carregando" sem ficar marcial. */
export const DOT_PULSE_MS = 1400;
export const DOT_PULSE_STAGGER_MS = 160;

/** Bubble fade-in (re-uso do `fade-up` existente — 420ms é o canônico do app). */
export const FADE_IN_UP_MS = 420;

/** Slide-up overlay (OverlaySalonMap, BottomSheet variants — também usado
 * pelo CallWaiterSheet 220ms ease-out). */
export const SLIDE_UP_OVERLAY_MS = 220;

/**
 * `cManagerArrive` — dedicated arrival animation pro `ManagerBubble`.
 *
 * Por que separado de `fadeInUp`: o bubble do gerente é tempo-sensível
 * (chega quando a IA já está respondendo OU em paralelo) e o canvas v14
 * pediu uma curva levemente mais firme (cubic-bezier "expo") pra dar
 * sensação de "alguém entrou na conversa", em vez do fade neutro do
 * `fadeInUp`. Mantemos como objeto auto-contido (keyframes + className +
 * duration + easing) pro callsite poder coordenar timeouts (ex: esperar
 * a animação terminar antes de tocar som).
 *
 * As keyframes propriamente ditas vivem em `globals.css` como
 * `@keyframes managerArrive` — Tailwind/CSS é mais barato que JS pra
 * uma animação que pode rodar 5-10× por sessão.
 */
export const cManagerArrive = {
  keyframes:
    '@keyframes managerArrive { from { transform: translateY(8px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }',
  className: 'animate-manager-arrive',
  duration: '360ms',
  easing: 'cubic-bezier(.2,.8,.2,1)',
} as const;

// ─── Tailwind classes ─────────────────────────────────────────────────

/**
 * Wrapper centralizado das classes Tailwind das animações novas.
 * Usar `animationClass.X` em vez de copiar a string facilita refactor
 * (uma trocada aqui propaga em todos primitivos + screens).
 */
export const animationClass = {
  /** 3-dot pulse — para ToolCallIndicator. Aplica em cada dot individualmente
   * (com style.animationDelay para o stagger entre os 3). */
  dotPulse: 'animate-dot-pulse-stagger',

  /** Bubble appearance (alias do fade-up existente). */
  fadeInUp: 'animate-fade-up',

  /** Slide-up overlay (OverlaySalonMap, CallWaiterSheet — entram do bottom). */
  slideUpOverlay: 'animate-slide-up-overlay',
} as const;

// ─── Reduced motion hook ──────────────────────────────────────────────

/**
 * `prefers-reduced-motion: reduce` — retorna true se o usuário pediu
 * pra desligar animações via OS. Primitivos checam e devolvem string
 * vazia em vez de animationClass.X.
 *
 * Implementação:
 * - SSR-safe (retorna false durante SSR pra não causar hydration mismatch)
 * - Reage a mudanças em runtime (subscribe MQL change)
 *
 * Globals.css já tem o catch-all `@media (prefers-reduced-motion: reduce)`
 * que zera animation-duration globalmente. Este hook é o complemento JS:
 * permite que primitivos parem de aplicar animations classes ou pulem
 * tweens custom (ex.: liquid morph que usa setTimeout pra coordenar fases).
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mql.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    // addEventListener é a forma moderna; mas Safari < 14 só tem addListener.
    // O fallback evita crash em iOS antigo (raro mas pode acontecer).
    if (mql.addEventListener) {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, []);

  return reduced;
}

/**
 * Helper: devolve a className de animação OU string vazia se reduced-motion
 * tá ligado. Encapsula o padrão `useReducedMotion() ? '' : animationClass.X`
 * pra que primitivos não dupliquem a checagem.
 */
export function useAnimation(name: keyof typeof animationClass): string {
  const reduced = useReducedMotion();
  return reduced ? '' : animationClass[name];
}
