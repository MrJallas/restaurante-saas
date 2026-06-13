import { memo } from 'react';

interface BlinkingCursorProps {
  height?: number;
  className?: string;
}

/** Cursor piscante puramente visual — memo para n\u00e3o repintar junto com parent. */
export const BlinkingCursor = memo(function BlinkingCursor({
  height = 20,
  className = '',
}: BlinkingCursorProps) {
  return (
    <span
      aria-hidden
      className={`ml-[3px] inline-block w-[2px] animate-blink bg-ink align-middle ${className}`}
      style={{ height }}
    />
  );
});
