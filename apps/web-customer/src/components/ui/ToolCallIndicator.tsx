'use client';

/**
 * "··· USANDO {name} ···" — mono caps tiny indicator rendered while the AI
 * is invoking a backend tool. Per `cliente-tokens.jsx` (V20).
 *
 * STUB: this is C1's primitive — replace with the real implementation when
 * C1 lands. The category color map mirrors `TOOL_CATEGORY_COLORS` in the
 * canvas — `staff` is mostarda mute (warning token), `destructive` is brick,
 * everything else is mute neutral.
 */
export type ToolCategory =
  | 'menu'
  | 'order'
  | 'session'
  | 'info'
  | 'staff'
  | 'payment'
  | 'destructive'
  | 'lgpd';

interface ToolCallIndicatorProps {
  name: string;
  category?: ToolCategory;
}

const CATEGORY_CLASS: Record<ToolCategory, string> = {
  menu: 'text-mute',
  order: 'text-mute',
  session: 'text-mute',
  info: 'text-mute',
  staff: 'text-[#b88a1a]',
  payment: 'text-mute',
  destructive: 'text-danger',
  lgpd: 'text-mute',
};

export function ToolCallIndicator({
  name,
  category = 'menu',
}: ToolCallIndicatorProps) {
  const colorClass = CATEGORY_CLASS[category] ?? 'text-mute';
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[1.5px] ${colorClass}`}
      aria-label={`Usando ${name}`}
    >
      <span className="inline-flex gap-[3px]" aria-hidden>
        <span className="h-[3px] w-[3px] animate-bounce-dot rounded-sm bg-current" />
        <span
          className="h-[3px] w-[3px] animate-bounce-dot rounded-sm bg-current"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="h-[3px] w-[3px] animate-bounce-dot rounded-sm bg-current"
          style={{ animationDelay: '300ms' }}
        />
      </span>
      <span>USANDO {name}</span>
      <span className="inline-flex gap-[3px]" aria-hidden>
        <span className="h-[3px] w-[3px] animate-bounce-dot rounded-sm bg-current" />
        <span
          className="h-[3px] w-[3px] animate-bounce-dot rounded-sm bg-current"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="h-[3px] w-[3px] animate-bounce-dot rounded-sm bg-current"
          style={{ animationDelay: '300ms' }}
        />
      </span>
    </span>
  );
}
