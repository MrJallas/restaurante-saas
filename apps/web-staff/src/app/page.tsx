'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function StaffHome() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-white">
      <a
        href="/login"
        className="rounded-lg border border-white/15 bg-white px-4 py-2 text-sm font-semibold text-zinc-950"
      >
        Entrar
      </a>
    </main>
  );
}
