/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@restaurant/shared-types'],

  // Em mobile real (iPhone + hotspot + firewall do Mac), a porta 3001 da API
  // nao e alcancavel de fora — so a 3003 (web-customer) passa. Em vez de
  // mexer no firewall do macOS, proxyamos `/api/*` pra dentro do Docker:
  // o iPhone fala so com 3003, e o Next repassa pra rede interna do compose
  // via nome de servico `api:3001`. Como bonus: vira same-origin, entao
  // cookies httpOnly e CORS param de importar.
  //
  // `API_UPSTREAM` permite override via env (pra rodar fora do compose).
  async rewrites() {
    const upstream = process.env.API_UPSTREAM || 'http://api:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${upstream}/api/:path*`,
      },
    ];
  },

  // A05: conjunto seguro de headers de segurança em toda resposta. Só os que
  // NÃO alteram render (headers HTTP não tocam o V20): anti-MIME-sniff,
  // anti-clickjacking, referrer, HSTS. CSP/Permissions-Policy ficam de fora
  // aqui — exigem teste por-página (inline styles/scripts do Next, geoloc do
  // cliente) e são follow-up deliberado, não regressão.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
