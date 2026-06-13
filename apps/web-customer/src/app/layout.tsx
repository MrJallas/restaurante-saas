import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Restaurant SaaS',
  description: 'Experiência digital para restaurantes',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
  // NÃO reintroduzir `interactiveWidget`: a chave `interactive-widget` é
  // Chromium-only — o WebKit/iOS não a reconhece e loga console.error em
  // TODA página ("Viewport argument key \"interactive-widget\" not
  // recognized"), que era a origem do toast "1 error" do dev overlay na
  // landing do assistente (bug 2026-06-11, prompt 100 §6). O ajuste de
  // teclado já é feito via visualViewport (SoftInput/mesa page) nos dois
  // engines.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-bg font-body text-ink antialiased">{children}</body>
    </html>
  );
}
