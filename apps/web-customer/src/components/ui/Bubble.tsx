import { ReactNode, memo } from 'react';

type Role = 'user' | 'ai' | 'blocked';

interface BubbleProps {
  role: Role;
  children: ReactNode;
}

/**
 * Balao de chat. `memo` evita repintar o historico inteiro a cada keystroke no
 * input — so remonta quando `role`/`children` mudam. A sombra no AI/blocked e
 * sutil (1px, 4% black) so pra dar uma ancora visual agora que nao ha mais o
 * backdrop-blur separando as camadas.
 */
export const Bubble = memo(function Bubble({ role, children }: BubbleProps) {
  if (role === 'user') {
    return (
      <div className="max-w-[82%] self-end rounded-[18px] rounded-br-[4px] bg-ink px-4 py-3 text-[14px] leading-[1.45] text-white">
        {children}
      </div>
    );
  }
  const blocked = role === 'blocked';
  return (
    <div
      className={`max-w-[86%] self-start rounded-[18px] rounded-bl-[4px] border px-4 py-3 text-[14px] leading-[1.5] shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${
        blocked ? 'border-danger bg-[#fdf2f2] text-[#7a1f1f]' : 'border-ink bg-bg text-ink'
      }`}
      style={{ textWrap: 'pretty' as never }}
    >
      {blocked && (
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[1px] text-danger">
          Fora de escopo
        </div>
      )}
      {children}
    </div>
  );
});
