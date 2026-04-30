import { memo } from 'react';

interface CountdownCircleProps {
  /** seconds remaining */
  seconds: number;
  /** total duration in seconds (for fill %) */
  total: number;
  size?: number;
}

/**
 * Circulo animado de contagem regressiva. Props primitivas — `memo` padrao
 * corta render quando `seconds` nao mudou (ex.: parent repinta por outro motivo).
 */
export const CountdownCircle = memo(function CountdownCircle({ seconds, total, size = 58 }: CountdownCircleProps) {
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, (total - seconds) / total));
  const dash = circumference * (1 - progress);

  return (
    <div
      className="relative flex shrink-0 items-center justify-center text-[22px] font-semibold tabular-nums text-ink"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 -rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--color-ink)"
          strokeWidth={2}
          fill="none"
          opacity={0.15}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--color-ink)"
          strokeWidth={2}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dash}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      <span>{Math.max(0, seconds)}</span>
    </div>
  );
});
