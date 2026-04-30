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
  // iOS 16.4+ redimensiona o layout quando o teclado abre em vez de empurrar
  // a pagina toda. Em versoes antigas cai no fallback do visualViewport.
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-bg font-body text-ink antialiased">{children}</body>
    </html>
  );
}
