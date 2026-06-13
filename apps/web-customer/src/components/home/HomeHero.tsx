'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { BlinkingCursor } from '../ui/BlinkingCursor';

interface HomeHeroProps {
  message: string | ReactNode;
  /**
   * Eyebrow acima da fala da IA. Aceita ReactNode pra eyebrow de status do
   * pedido (prompt 100 — `Assistente · ● Em preparo · 5–9 min`); a
   * tipografia continua a mesma (o container uppercase/tracking não muda).
   */
  kicker?: ReactNode;
  onTypingComplete?: () => void;
  animate?: boolean;
}

export function HomeHero({
  message,
  kicker = 'Assistente',
  onTypingComplete,
  animate = true,
}: HomeHeroProps) {
  const isString = typeof message === 'string';

  return (
    <div data-testid="home-hero" className="mt-6">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[1px] text-mute">
        {kicker}
      </div>
      <div className="max-w-[320px] text-[20px] leading-[1.4] tracking-[-0.015em] text-ink text-pretty">
        {animate && isString ? (
          <TypingInline text={message as string} onComplete={onTypingComplete} />
        ) : (
          <>
            {message}
            <BlinkingCursor className="ml-[3px]" />
          </>
        )}
      </div>
    </div>
  );
}

function TypingInline({ text, onComplete }: { text: string; onComplete?: () => void }) {
  const [shown, setShown] = useState('');
  const [done, setDone] = useState(false);
  const indexRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const speed = text.length > 150 ? 15 : 25;

  useEffect(() => {
    indexRef.current = 0;
    lastRef.current = 0;
    setShown('');
    setDone(false);
    function step(t: number) {
      if (!lastRef.current) lastRef.current = t;
      if (t - lastRef.current >= speed) {
        lastRef.current = t;
        indexRef.current += 1;
        setShown(text.slice(0, indexRef.current));
        if (indexRef.current >= text.length) {
          setDone(true);
          onComplete?.();
          return;
        }
      }
      rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [text, speed, onComplete]);

  return (
    <>
      {shown}
      {!done && <BlinkingCursor className="ml-[2px]" />}
    </>
  );
}
