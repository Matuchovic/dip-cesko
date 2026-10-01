import 'server-only';

/** Serverová konfigurace. Tajné hodnoty se nikdy neposílají klientovi. */
export const serverEnv = {
  golemioKey: (process.env.GOLEMIO_API_KEY ?? '').trim() || null,
  demo: process.env.DEMO_DATA === '1',
  otpUrl: (process.env.OTP_GRAPHQL_URL ?? '').trim() || null,
  mapStyleUrl: (process.env.MAP_STYLE_URL ?? '').trim() || 'https://tiles.openfreemap.org/styles/liberty',
  adminToken: (process.env.ADMIN_TOKEN ?? '').trim() || null,
};
