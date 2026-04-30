interface PlayIconProps {
  size?: number;
}

export function PlayIcon({ size = 42 }: PlayIconProps) {
  const strokeW = Math.max(2, size * 0.08);
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-white shadow-sm"
      style={{
        width: size,
        height: size,
        border: `${strokeW}px solid var(--color-ink)`,
      }}
    >
      <svg
        width={size * 0.5}
        height={size * 0.5}
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden
      >
        <path
          d="M5 3.5 L16 10 L5 16.5 Z"
          fill="var(--color-ink)"
          stroke="var(--color-ink)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
