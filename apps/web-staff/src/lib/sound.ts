/**
 * Beep curto via Web Audio API — mesmo envelope do KDS da cozinha
 * (`/cozinha`): oscilador senoidal, ganho 0.3 → decaimento exponencial em
 * ~500ms. iOS + desktop via `AudioContext || webkitAudioContext`.
 *
 * Extraído pra cá no prompt 100 §5.5 (host UI "pediu a recepção") em vez
 * de criar uma terceira cópia inline. O KDS mantém a dele por enquanto
 * (consolidação está no backlog de cleanup aceito — MEMORY.md).
 */
export function playBeep(frequency = 880): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.5);
    oscillator.onended = () => {
      void ctx.close();
    };
  } catch {
    /* som é cortesia — nunca derruba a tela */
  }
}
