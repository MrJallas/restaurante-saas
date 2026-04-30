import { ReactNode, memo } from 'react';

interface RowProps {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}

/** Dupla label/value usada em resumos de conta. Render puro, memoizado. */
export const Row = memo(function Row({ label, value, className = '' }: RowProps) {
  return (
    <div
      className={`flex items-baseline justify-between py-1 text-[13px] text-mute tabular-nums ${className}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
});
