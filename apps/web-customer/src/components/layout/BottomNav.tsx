'use client';

import { Home, BookOpen, ClipboardList, Sparkles, CreditCard } from 'lucide-react';
import { usePathname } from 'next/navigation';

interface BottomNavProps {
  slug: string;
}

const navItems = [
  { id: 'home', label: 'Home', icon: Home, href: '' },
  { id: 'cardapio', label: 'Cardapio', icon: BookOpen, href: '/cardapio' },
  { id: 'pedido', label: 'Pedido', icon: ClipboardList, href: '/pedido' },
  { id: 'assistente', label: 'Assistente', icon: Sparkles, href: '/assistente' },
  { id: 'conta', label: 'Conta', icon: CreditCard, href: '/pagamento' },
];

export function BottomNav({ slug }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-primary/95 backdrop-blur-sm safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-2">
        {navItems.map((item) => {
          const fullHref = `/${slug}${item.href}`;
          const isActive = item.href === ''
            ? pathname.includes('/mesa/')
            : pathname.startsWith(fullHref);

          return (
            <a
              key={item.id}
              href={fullHref || pathname}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 transition-colors ${
                isActive ? 'text-accent' : 'text-white/40 hover:text-white/60'
              }`}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
