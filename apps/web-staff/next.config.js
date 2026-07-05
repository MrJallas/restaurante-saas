/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@restaurant/shared-types'],
  // A05: não vazar o framework/versão no header (reduz info-disclosure).
  poweredByHeader: false,

  // A05: conjunto seguro de headers de segurança em toda resposta (só os que
  // NÃO alteram render: anti-MIME-sniff, anti-clickjacking, referrer, HSTS).
  // CSP/Permissions-Policy ficam de follow-up (precisam de teste por-página).
  async headers() {
    const base = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
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
