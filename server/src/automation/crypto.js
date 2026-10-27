// Gmail refresh token'larını veritabanında şifreli tutmak (AES-256-GCM) ve OAuth
// "state" parametresini imzalamak (HMAC-SHA256) için küçük yardımcılar.
// Anahtar yalnızca sunucu ortam değişkeninde durur (TOKEN_ENC_KEY).
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const keyFrom = (secret, purpose) => createHash('sha256').update(`${purpose}:${secret}`).digest();

export function createSealer(secret) {
  if (!secret) throw new Error('TOKEN_ENC_KEY gerekli.');
  const encKey = keyFrom(secret, 'enc');
  const macKey = keyFrom(secret, 'mac');

  return {
    encrypt(plain) {
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', encKey, iv);
      const body = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
      return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
    },
    decrypt(sealed) {
      const [v, iv, tag, body] = String(sealed).split('.');
      if (v !== 'v1' || !iv || !tag || !body) throw new Error('bad token format');
      const d = createDecipheriv('aes-256-gcm', encKey, Buffer.from(iv, 'base64url'));
      d.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([d.update(Buffer.from(body, 'base64url')), d.final()]).toString('utf8');
    },
    /** Signed, expiring payload for the OAuth state parameter. */
    sign(payload, ttlMs = 10 * 60 * 1000, now = Date.now()) {
      const data = Buffer.from(JSON.stringify({ ...payload, exp: now + ttlMs })).toString('base64url');
      const mac = createHmac('sha256', macKey).update(data).digest('base64url');
      return `${data}.${mac}`;
    },
    verify(token, now = Date.now()) {
      const [data, mac] = String(token || '').split('.');
      if (!data || !mac) return null;
      const want = createHmac('sha256', macKey).update(data).digest();
      const got = Buffer.from(mac, 'base64url');
      if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
      try {
        const p = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
        return p.exp > now ? p : null;
      } catch {
        return null;
      }
    },
  };
}
