import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server';

export async function makeApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  await app.ready();
  return app;
}

let ipCounter = 10;
/** Unique client IP per call so route-level IP rate limits don't leak between tests. */
export const freshIp = () => {
  const n = ipCounter++;
  return `10.${Math.floor(n / 65536) % 255}.${Math.floor(n / 256) % 256}.${n % 256}`;
};

export interface Login {
  token: string;
  cookie: string;
  refreshToken?: string;
  body: { data: { accessToken: string; refreshToken?: string; user: Record<string, unknown> } };
}

/** Logs in via OTP verify (dev bypass 123456). */
export async function login(app: FastifyInstance, mobile: string, extra: Record<string, unknown> = {}): Promise<Login> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/otp/verify',
    remoteAddress: freshIp(),
    payload: { mobile, code: '123456', trustDevice: true, ...extra },
  });
  if (res.statusCode !== 200) throw new Error(`login failed ${res.statusCode} ${res.body}`);
  const body = res.json();
  const c = res.cookies.find((x) => x.name === 'msblr_rt');
  return { token: body.data.accessToken, cookie: c ? `${c.name}=${c.value}` : '', refreshToken: body.data.refreshToken, body };
}
export const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

/** Build a multipart/form-data payload for app.inject. */
export function multipart(fields: Record<string, string>, file?: { name: string; filename: string; mime: string; data: Buffer }) {
  const boundary = '----msblrtest' + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  if (file) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.mime}\r\n\r\n`,
      ),
    );
    parts.push(file.data, Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
