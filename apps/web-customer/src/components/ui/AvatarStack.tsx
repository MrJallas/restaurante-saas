import { memo } from 'react';
import { Avatar } from './Avatar';

export interface StackPerson {
  initial: string;
  color?: string;
  name?: string;
}

interface AvatarStackProps {
  people: StackPerson[];
  size?: number;
  max?: number;
}

/**
 * Pilha de avatares (ate `max`) na home/TopBar. Memoizado pra nao repintar a
 * cada re-render do parent quando o array `people` nao mudou por referencia —
 * o polling de participantes preserva a mesma ref quando nada mudou.
 */
export const AvatarStack = memo(function AvatarStack({
  people,
  size = 30,
  max = 4,
}: AvatarStackProps) {
  const show = people.slice(0, max);
  const overflow = people.length - show.length;
  return (
    <div className="flex items-center">
      {show.map((p, i) => (
        <div key={`${p.initial}-${i}`} style={{ marginLeft: i === 0 ? 0 : -8 }}>
          <Avatar initial={p.initial} color={p.color} size={size} border />
        </div>
      ))}
      {overflow > 0 && (
        <div style={{ marginLeft: -8 }}>
          <Avatar initial={`+${overflow}`} color="#6b6b6b" size={size} border />
        </div>
      )}
    </div>
  );
});
