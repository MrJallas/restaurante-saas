import { memo } from 'react';

interface AvatarProps {
  initial: string;
  color?: string;
  size?: number;
  border?: boolean;
  dashed?: boolean;
  className?: string;
}

/**
 * Avatar minusculo usado em AvatarStack (TopBar) e nas listas de mesa/divisao.
 * Props sao primitivas — `memo` padrao resolve bem, sem areEqual custom.
 */
export const Avatar = memo(function Avatar({
  initial,
  color,
  size = 32,
  border = false,
  dashed = false,
  className = '',
}: AvatarProps) {
  if (dashed) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-full border-[1.3px] border-dashed border-ink bg-bg text-ink ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.45 }}
      >
        {initial || '⊞'}
      </div>
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{
        width: size,
        height: size,
        background: color ?? 'var(--color-ink)',
        fontSize: size * 0.38,
        border: border ? '2px solid #fff' : undefined,
      }}
    >
      {initial}
    </div>
  );
});
