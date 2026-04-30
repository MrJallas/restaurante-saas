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
};

module.exports = nextConfig;
