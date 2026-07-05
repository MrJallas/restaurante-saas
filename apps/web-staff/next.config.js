/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@restaurant/shared-types'],
  // A05: não vazar o framework/versão no header (reduz info-disclosure).
  poweredByHeader: false,

  // A05: nosniff/anti-clickjacking/referrer/HSTS + Permissions-Policy enforce
  // (só desliga o não-usado; PRESERVA camera=self que o scan-qr do garçom usa)
  // + CSP em REPORT-ONLY (documenta, não bloqueia; enforce exige nonces do Next).
  async headers() {
    const base = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      // web-staff USA camera (ScreenWaiterScanQr) → preserva self; geoloc/mic/
      // pagamento/usb não são usados → desligados.
      {
        key: 'Permissions-Policy',
        value: 'camera=(self), geolocation=(), microphone=(), payment=(), usb=()',
      },
      // CSP ENFORCE com nonce agora vive no `src/proxy.ts` (per-request).
    ];
    // HSTS só em produção: o browser ignora sobre HTTP, e não queremos pinar
    // HTTPS num domínio de dev LAN (espelha o gate do middleware da API).
    if (process.env.NODE_ENV === 'production') {
      base.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains',
      });
    }
    return [{ source: '/:path*', headers: base }];
  },
};

module.exports = nextConfig;
