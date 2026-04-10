'use client';

import { BookOpen, Sparkles, Bell, ClipboardList, CreditCard } from 'lucide-react';

interface QuickAction {
  id: string;
  label: string;
  icon: string;
  href: string;
}

interface QuickActionButtonsProps {
  actions: QuickAction[];
  visible: boolean;
  slug: string;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  'book-open': BookOpen,
  sparkles: Sparkles,
  bell: Bell,
  'clipboard-list': ClipboardList,
  'credit-card': CreditCard,
};

export function QuickActionButtons({ actions, visible, slug }: QuickActionButtonsProps) {
  return (
    <div
      className={`grid grid-cols-3 gap-3 transition-all duration-500 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      {actions.map((action) => {
        const Icon = iconMap[action.icon];
        const href = action.href.startsWith('#')
          ? action.href
          : `/${slug}${action.href}`;

        return (
          <a
            key={action.id}
            href={href}
            className="flex flex-col items-center gap-2 rounded-xl bg-white/10 p-4 backdrop-blur-sm transition-all hover:bg-white/20 active:scale-95"
          >
            {Icon && <Icon className="h-6 w-6 text-accent" />}
            <span className="text-center text-xs font-medium text-white/80">{action.label}</span>
          </a>
        );
      })}
    </div>
  );
}
