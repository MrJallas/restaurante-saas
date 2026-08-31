import type { Page, Locator } from '@playwright/test';

/**
 * Utilitários de "câmera" pras demos. O objetivo é que o vídeo pareça alguém
 * usando o app, não um robô: nada de salto instantâneo entre estados.
 *
 * Regra geral: toda ação visível ganha um beat antes e depois, porque o olho
 * precisa de ~600ms pra registrar que a tela mudou.
 */

/** Pausa. O default (900ms) é o tempo de leitura de uma linha curta. */
export async function beat(page: Page, ms = 900) {
  await page.waitForTimeout(ms);
}

/**
 * Scroll suave em passos pequenos, via DOM.
 *
 * Não usa `page.mouse.wheel`: WebKit mobile (o engine das demos de celular)
 * não implementa wheel. Rolar pelo DOM também resolve o caso comum de app
 * mobile em que quem rola não é a window, e sim um container interno com
 * `overflow-y: auto` — a gente descobre o alvo real no primeiro passo.
 */
export async function smoothScroll(page: Page, distance: number, steps = 24) {
  const step = distance / steps;
  for (let i = 0; i < steps; i += 1) {
    await page.evaluate((dy) => {
      const rolavel = (el: Element | null): boolean => {
        if (!el) return false;
        const s = getComputedStyle(el);
        return (
          /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 8
        );
      };

      const antes = window.scrollY;
      window.scrollBy(0, dy);
      if (window.scrollY !== antes) return;

      // A window não moveu: achar o maior container rolável e rolar nele.
      const alvo = Array.from(document.querySelectorAll('*'))
        .filter(rolavel)
        .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
      if (alvo) alvo.scrollTop += dy;
    }, step);
    await page.waitForTimeout(28);
  }
  await beat(page, 500);
}

/** Digita devagar, como pessoa. 55ms/char lê bem em vídeo. */
export async function typeSlow(target: Locator, text: string, delay = 55) {
  await target.click();
  await target.type(text, { delay });
}

/**
 * Clica só se o elemento existir e estiver visível. As demos passeiam por
 * telas cujo conteúdo depende do estado do banco; um seletor ausente não pode
 * derrubar a gravação inteira.
 */
export async function softClick(
  page: Page,
  locator: Locator,
  label = '',
  timeout = 8000,
): Promise<boolean> {
  const alvo = locator.first();
  const visible = await alvo
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
  if (!visible) {
    if (label) console.log(`  · pulou (não visível): ${label}`);
    return false;
  }

  // Os chips do assistente nascem desabilitados e só habilitam quando a
  // saudação/resposta chega. Clicar antes disso é no-op silencioso — daí
  // esperar `enabled`, não só `visible`.
  const habilitou = await alvo
    .isEnabled()
    .then(async (ok) => {
      if (ok) return true;
      return page
        .waitForFunction(
          (t) => {
            const b = Array.from(document.querySelectorAll('button')).find((x) =>
              new RegExp(t, 'i').test(x.textContent || ''),
            );
            return b ? !(b as HTMLButtonElement).disabled : false;
          },
          label || '.',
          { timeout },
        )
        .then(() => true)
        .catch(() => false);
    })
    .catch(() => false);

  if (!habilitou) {
    if (label) console.log(`  · pulou (segue desabilitado): ${label}`);
    return false;
  }

  await beat(page, 450);
  await alvo.click().catch(() => {});
  await beat(page, 1100);
  return true;
}

/**
 * Gesto de arrastar com o dedo, via eventos de toque reais.
 *
 * Necessário porque as superfícies do cliente são bottom-sheets arrastáveis:
 * elas não têm container com overflow (o diagnóstico mostrou window, body e
 * document todos com scroll zero), então nem `mouse.wheel` (que o WebKit
 * mobile nem implementa) nem `scrollTop` movem alguma coisa. O que move é
 * touchstart → touchmove → touchend, que é o que o dedo faz.
 *
 * `dy` negativo arrasta pra cima (revela conteúdo abaixo).
 */
export async function swipe(page: Page, dy: number, passos = 18, x = 195, yInicial = 520) {
  // ATENÇÃO às coordenadas: no WebKit mobile a área útil é ~664px de altura
  // (o chrome do Safari desconta do viewport de 844), então gesto começando
  // abaixo disso não acerta elemento nenhum.
  //
  // Usa page.mouse, não eventos de toque sintéticos: o WebKit proíbe
  // `new Touch()` ("Illegal constructor"), e o sheet do cliente escuta
  // POINTER events (conforme o CLAUDE.md do repo) — que o mouse também
  // dispara. Movimento fatiado em passos pra dar inércia natural no vídeo.
  await page.mouse.move(x, yInicial);
  await page.mouse.down();
  for (let i = 1; i <= passos; i += 1) {
    await page.mouse.move(x, yInicial + (dy * i) / passos);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await beat(page, 450);
}

/** Espera a tela assentar: rede parada + um beat pro layout estabilizar. */
export async function settle(page: Page, ms = 1200) {
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await beat(page, ms);
}


/**
 * Esconde os indicadores de desenvolvimento do Next (badge do Dev Tools e o
 * toast "Compiling…").
 *
 * Feito pelo lado da GRAVAÇÃO, de propósito: o vídeo é artefato nosso, o app
 * não é. Mexer em `devIndicators` no next.config do produto para resolver um
 * problema de vídeo seria contaminar o código com uma necessidade que não é
 * dele. Aqui o CSS entra em toda navegação e some quando o contexto fecha.
 */
export async function esconderDevTools(page: Page) {
  const css = `
    nextjs-portal,
    [data-nextjs-toast],
    [data-next-badge-root],
    [data-nextjs-dev-tools-button],
    #__next-build-watcher,
    #__next-prerender-indicator { display: none !important; }
  `;
  await page.addStyleTag({ content: css }).catch(() => {});
  await page.addInitScript((c) => {
    const por = () => {
      const s = document.createElement('style');
      s.textContent = c;
      document.head?.appendChild(s);
    };
    if (document.head) por();
    else document.addEventListener('DOMContentLoaded', por);
  }, css).catch(() => {});
}
