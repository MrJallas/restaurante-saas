'use client';

import { useParams } from 'next/navigation';

export default function SlugIndex() {
  const params = useParams<{ slug: string }>();
  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-bg">
      <div className="max-w-sm text-center space-y-4">
        <div className="text-6xl">📱</div>
        <h1 className="text-xl font-semibold text-ink">
          Escaneie o QR da mesa
        </h1>
        <p className="text-sm text-ink/70">
          Para fazer seu pedido, escaneie o QR Code que está na sua mesa.
        </p>
        <p className="text-xs text-ink/50 pt-4">
          Restaurante: {params?.slug}
        </p>
      </div>
    </div>
  );
}
