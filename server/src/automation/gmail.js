// Gmail ile gönderim: OAuth (yalnızca gmail.send izni), refresh token ile erişim
// anahtarı alma ve CV ekli e-postayı kullanıcının kendi hesabından gönderme.
// Gelen kutusu okunmaz; istenen izinler: openid, email, gmail.send.
import { AppError } from '../lib/errors.js';

export const GMAIL_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send'];
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export const gmailRevoked = () =>
  new AppError('GMAIL_REVOKED', 409, 'Gmail bağlantın geçersiz olmuş. Ayarlar sekmesinden Gmail\'i yeniden bağla.');
const gmailFailed = (details) => new AppError('GMAIL_ERROR', 502, 'E-posta gönderilemedi. Lütfen biraz sonra tekrar dene.', details);

/** Encodes a header value with RFC 2047 when it contains non-ASCII characters. */
export function encodeHeader(value) {
  const v = String(value).replace(/[\r\n]+/g, ' ').trim();
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, 'utf8').toString('base64')}?=`;
}

const wrap76 = (b64) => b64.replace(/.{1,76}/g, '$&\r\n').trimEnd();
const asciiName = (s) =>
  String(s)
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => ({ ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' })[c])
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'CV';

/** Builds an RFC 5322 message: plain-text body (UTF-8) and one PDF attachment. */
export function buildMime({ from, fromName, to, subject, text, attachment, boundary = `hz_${Date.now().toString(36)}` }) {
  const fromHeader = fromName ? `${encodeHeader(fromName)} <${from}>` : from;
  const lines = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
  ];
  const body = wrap76(Buffer.from(String(text).replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64'));
  if (!attachment) {
    lines.push('Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', body);
    return lines.join('\r\n');
  }
  const name = asciiName(attachment.filename);
  lines.push(
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    body,
    `--${boundary}`,
    `Content-Type: application/pdf; name="${name}"`,
    `Content-Disposition: attachment; filename="${name}"`,
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(Buffer.from(attachment.bytes).toString('base64')),
    `--${boundary}--`,
    '',
  );
  return lines.join('\r\n');
}

const decodeJwtPayload = (jwt) => {
  try {
    return JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
};

export function createGmail({ clientId, clientSecret, redirectUri, fetchImpl = fetch, timeoutMs = 20_000 }) {
  async function post(url, body, headers = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { method: 'POST', headers, body, signal: ctrl.signal });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      throw gmailFailed({ cause: err.message });
    } finally {
      clearTimeout(timer);
    }
  }
  const form = (o) => new URLSearchParams(o).toString();
  const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };

  return {
    authUrl({ state, loginHint }) {
      const q = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: GMAIL_SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state,
      });
      if (loginHint) q.set('login_hint', loginHint);
      return `${AUTH_URL}?${q}`;
    },

    /** Exchanges the authorization code. Returns { refreshToken, email, scopes }. */
    async exchangeCode(code) {
      const r = await post(TOKEN_URL, form({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }), FORM);
      if (!r.ok) throw gmailFailed({ status: r.status, error: r.data?.error });
      const scopes = String(r.data.scope || '');
      return { refreshToken: r.data.refresh_token || null, email: decodeJwtPayload(r.data.id_token).email || null, scopes };
    },

    async accessToken(refreshToken) {
      const r = await post(TOKEN_URL, form({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' }), FORM);
      if (r.data?.error === 'invalid_grant') throw gmailRevoked();
      if (!r.ok || !r.data?.access_token) throw gmailFailed({ status: r.status, error: r.data?.error });
      return r.data.access_token;
    },

    async send(accessToken, mime) {
      const raw = Buffer.from(mime, 'utf8').toString('base64url');
      const r = await post(SEND_URL, JSON.stringify({ raw }), { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' });
      if (r.status === 401 || r.status === 403) throw gmailRevoked();
      if (!r.ok) throw gmailFailed({ status: r.status, error: r.data?.error?.message });
      return { id: r.data?.id };
    },

    async revoke(token) {
      await post(REVOKE_URL, form({ token }), FORM).catch(() => {});
    },
  };
}
