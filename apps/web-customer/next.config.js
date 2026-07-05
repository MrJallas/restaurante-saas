/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@restaurant/shared-types'],
  // A05: não vazar o framework/versão no header (reduz info-disclosure).
  poweredByHeader: false,

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
  // anti-clickjacking, referrer, HSTS. Permissions-Policy é enforce (só desliga
  // features comprovadamente não-usadas; PRESERVA geolocation=self, que o fluxo
  // de mesa precisa). CSP entra em REPORT-ONLY: documenta a política e não
  // bloqueia nada — promover pra enforce exige nonces (script inline do Next) +
  // observar reports, follow-up em docs/SECURITY-FOLLOWUPS.md.
  async headers() {
    const base = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      // web-customer USA geolocation (lib/location.ts) → preserva self; câmera/
      // mic/pagamento/usb não são usados → desligados.
      {
        key: 'Permissions-Policy',
        value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()',
      },
      // Report-only: baseline seguro (não bloqueia). object-src/base-uri/
      // frame-ancestors fechados; script/style com unsafe-inline que o Next
      // precisa hoje (nonce vem depois).
      {
        key: 'Content-Security-Policy-Report-Only',
        value:
          "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: blob:; font-src 'self' data:; " +
          "connect-src 'self' ws: wss: http: https:; form-action 'self'",
      },
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
