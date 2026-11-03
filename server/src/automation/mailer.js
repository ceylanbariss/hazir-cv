// Hazır CV'nin kendi e-postaları (Resend): günlük özet gönderimi ve
// <alert_code>@alarm.hazircv.com.tr adresine yönlendirilen iş alarmlarının alınması.
// Kullanıcının Gmail'i bu işler için hiç kullanılmaz.
import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.resend.com';

export function createMailer({ apiKey, from, fetchImpl = fetch, timeoutMs = 15_000 }) {
  async function call(path, init = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(API + path, {
        ...init,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(`resend ${res.status} ${data?.message || data?.name || ''}`.trim());
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    from,
    /** Sends one e-mail. Returns { id }. */
    send: ({ to, subject, text, html, replyTo }) =>
      call('/emails', { method: 'POST', body: JSON.stringify({ from, to: [to], subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }) }),
    /** Full content of a received e-mail (the webhook only carries metadata). */
    getReceived: (id) => call(`/emails/receiving/${encodeURIComponent(id)}`),
  };
}

/**
 * Resend webhooks are signed the Svix way: base64(HMAC-SHA256(secret, `${id}.${timestamp}.${body}`))
 * in the svix-signature header ("v1,<sig> v1,<sig2>"). Secret format: "whsec_<base64>".
 */
export function verifySvix({ id, timestamp, signature, body, secret, now = Date.now(), toleranceSec = 300 }) {
  if (!id || !timestamp || !signature || !secret) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > toleranceSec) return false;
  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  return String(signature)
    .split(' ')
    .map((p) => p.split(',')[1])
    .filter(Boolean)
    .some((sig) => {
      const got = Buffer.from(sig, 'base64');
      return got.length === expected.length && timingSafeEqual(got, expected);
    });
}
