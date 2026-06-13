import { memo } from 'react';

interface QRPatternProps {
  /** string seed to make the pseudo-random pattern stable per payment */
  seedString?: string;
  className?: string;
}

/**
 * QR fake determin\u00edstico — o c\u00e1lculo de celulas \u00e9 O(441) e recalcular a cada
 * tick do contador na tela de Pix custa caro sem raz\u00e3o. Memo resolve.
 */
export const QRPattern = memo(function QRPattern({
  seedString = 'pix',
  className = '',
}: QRPatternProps) {
  const size = 21;
  let seedHash = 0;
  for (let i = 0; i < seedString.length; i++) {
    seedHash = (seedHash * 31 + seedString.charCodeAt(i)) & 0xffff;
  }
  const bit = (i: number, j: number) => (i * 73 + j * 41 + i * j * 13 + seedHash) % 7 < 3;

  const cells: Array<[number, number]> = [];
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (bit(i, j)) cells.push([i, j]);
    }
  }

  const Corner = ({ ox, oy }: { ox: number; oy: number }) => (
    <g>
      <rect x={ox} y={oy} width={7} height={7} fill="#000" />
      <rect x={ox + 1} y={oy + 1} width={5} height={5} fill="#fff" />
      <rect x={ox + 2} y={oy + 2} width={3} height={3} fill="#000" />
    </g>
  );

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height="100%"
      shapeRendering="crispEdges"
      className={className}
      aria-label="QR Code"
    >
      {cells.map(([i, j]) => {
        if ((i < 7 && j < 7) || (i < 7 && j > size - 8) || (i > size - 8 && j < 7)) return null;
        return <rect key={`${i}-${j}`} x={j} y={i} width={1} height={1} fill="#000" />;
      })}
      <Corner ox={0} oy={0} />
      <Corner ox={size - 7} oy={0} />
      <Corner ox={0} oy={size - 7} />
    </svg>
  );
});
