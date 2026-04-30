import { memo } from 'react';

interface FoodPlaceholderProps {
  label?: string;
  height?: number | string;
  className?: string;
  rounded?: string;
  noBorder?: boolean;
}

/** Fallback visual quando item nao tem `imageUrl`. Puramente apresentacional. */
export const FoodPlaceholder = memo(function FoodPlaceholder({
  label = 'prato',
  height = 120,
  className = '',
  rounded = 'rounded-[14px]',
  noBorder = false,
}: FoodPlaceholderProps) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden ${rounded} ${
        noBorder ? '' : 'border border-border-soft'
      } ${className}`}
      style={{
        height: typeof height === 'number' ? `${height}px` : height,
        background:
          'repeating-linear-gradient(45deg, #fafafa, #fafafa 6px, #efede8 6px, #efede8 12px)',
      }}
    >
      <span
        className="text-[10px] font-mono lowercase tracking-[1px] text-faint"
        style={{ fontFamily: 'ui-monospace, "SF Mono", monospace' }}
      >
        {label}
      </span>
    </div>
  );
});
