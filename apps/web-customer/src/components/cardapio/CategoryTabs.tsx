'use client';

interface Category {
  id: string;
  name: string;
}

interface CategoryTabsProps {
  categories: Category[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
}

export function CategoryTabs({ categories, activeId, onSelect }: CategoryTabsProps) {
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2">
      <button
        onClick={() => onSelect(null)}
        className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
          activeId === null
            ? 'bg-accent text-white'
            : 'bg-white/10 text-white/60 hover:text-white/80'
        }`}
      >
        Todos
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            activeId === cat.id
              ? 'bg-accent text-white'
              : 'bg-white/10 text-white/60 hover:text-white/80'
          }`}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
}
