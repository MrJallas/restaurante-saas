'use client';

import { useEffect, useState } from 'react';

interface TypewriterBubbleProps {
  /** Full message to type out. */
  text: string;
  /** Eyebrow line above the text (e.g. "PEDIDO DA MESA 14 · AGORA"). */
  eyebrow?: string;
  /** Speed in ms per character (default: 25, per spec). */
  msPerChar?: number;
  /** Render-time decorations after the text completes (chips, etc.). */
  children?: React.ReactNode;
  /** Stable hook for E2E checks. */
  testId?: string;
  /**
   * If true, render the full text immediately (no animation). Used when the
   * customer arrived via push tap — they made a conscious gesture, so
   * rebobinating the typewriter would be irritating.
   */
  skipAnimation?: boolean;
  /** Force urgent styling (border-left mostarda) regardless of completion. */
  urgent?: boolean;
}

/**
 * Typewriter bubble per docs/features/customer-host-model.md (frame 04 of
 * cliente-table-merge.jsx — also the late-arrival inline notification).
 *
 * Visual rules:
 *  - 25 ms per char by default (cTypewriter spec)
 *  - 2 px ink cursor blinking 1 s while typing
 *  - border-left 4 px mostarda (`warning`) while decision is pending; reverts
 *    to a normal border when chips have been used (caller flips `urgent`)
 *  - chips/children appear after the text completes (cChipsFade 220 ms)
 *
 * Note: customer tokens don't currently have a "warning" color (the customer
 * app is monochromatic). We use `--color-accent` as a stand-in — owner can
 * customize via tenant theme. The visual canvas spec calls this "mostarda";
 * since C1's tokens module isn't merged yet, we approximate inline.
 */
export function TypewriterBubble({
  text,
  eyebrow,
  msPerChar = 25,
  children,
  testId,
  skipAnimation = false,
  urgent,
}: TypewriterBubbleProps) {
  const [shown, setShown] = useState(skipAnimation ? text.length : 0);
  const completed = shown >= text.length;
  const isUrgent = urgent ?? !completed;

  useEffect(() => {
    if (skipAnimation) {
      setShown(text.length);
      return;
    }
    setShown(0);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      if (i >= text.length) {
        setShown(text.length);
        window.clearInterval(id);
      } else {
        setShown(i);
      }
    }, msPerChar);
    return () => window.clearInterval(id);
  }, [text, msPerChar, skipAnimation]);

  return (
    <div
      data-testid={testId}
      className="rounded-[12px] border border-border-soft bg-white p-3.5"
      style={{
        borderLeft: isUrgent ? '4px solid #d4a017' : undefined,
        animation: 'cMergeBubbleEnter 280ms cubic-bezier(.4,0,.2,1) both',
      }}
    >
      {eyebrow && (
        <div className="mb-2 flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: '#d4a017',
              animation: isUrgent ? 'cWarnPulse 1.6s ease-in-out infinite' : undefined,
            }}
          />
          <span
            className="text-[9.5px] font-bold uppercase tracking-[1.2px]"
            style={{ color: '#d4a017' }}
          >
            {eyebrow}
          </span>
        </div>
      )}

      <p className="text-[15px] leading-[1.5] tracking-[-0.05px] text-ink">
        {text.slice(0, shown)}
        {!completed && (
          <span
            aria-hidden
            className="ml-0.5 inline-block h-[18px] w-[2px] align-[-3px] bg-ink"
            style={{ animation: 'cursor-blink 1s infinite' }}
          />
        )}
      </p>

      {completed && children && (
        <div className="mt-3" style={{ animation: 'cChipsFade 220ms ease-out 80ms both' }}>
          {children}
        </div>
      )}

      <style>{`
        @keyframes cMergeBubbleEnter {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cWarnPulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.4; }
        }
        @keyframes cChipsFade {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cursor-blink {
          0%, 50%   { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
