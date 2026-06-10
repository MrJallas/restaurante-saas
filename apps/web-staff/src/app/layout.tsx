import type { Metadata } from 'next';
import './globals.css';
import { StaffThemeProvider } from '../lib/theme';

export const metadata: Metadata = {
  title: 'Restaurant SaaS — Staff',
  description: 'Painel de gestao do restaurante',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <StaffThemeProvider>{children}</StaffThemeProvider>
      </body>
    </html>
  );
}
