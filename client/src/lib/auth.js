// Supabase Auth, bağımlılıksız (D9: yeni çalışma zamanı bağımlılığı yok).
// Google ile giriş PKCE akışıyla yapılır; erişim anahtarı URL'ye hiç düşmez.
// Oturum localStorage'da tutulur ve süresi dolmadan yenilenir.
const URL_ = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const KEY = 'hazircv.auth';
const VERIFIER = 'hazircv.pkce';

export const authConfigured = Boolean(URL_ && ANON);

const listeners = new Set();
const emit = (s) => listeners.forEach((fn) => fn(s));
export const onAuthChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const save = (s) => { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* özel pencere */ } emit(s); };

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function tokenRequest(grant, body) {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(j.error_description || j.msg || 'Oturum açılamadı.');
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
    user: j.user ? { id: j.user.id, email: j.user.email } : null,
  };
}

export async function signInWithGoogle() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  sessionStorage.setItem(VERIFIER, verifier);
  const p = new URLSearchParams({
    provider: 'google',
    redirect_to: `${window.location.origin}/otomasyon`,
    code_challenge: challenge,
    code_challenge_method: 's256',
  });
  window.location.assign(`${URL_}/auth/v1/authorize?${p}`);
}

/** Google Identity Services jetonunu Supabase oturumuna çevirir. */
export async function signInWithIdToken({ idToken, nonce }) {
  const s = await tokenRequest('id_token', { provider: 'google', id_token: idToken, nonce });
  save(s);
  return s;
}

/** Google dönüşünü (?code=…) oturuma çevirir. Dönüş yoksa null döner. */
export async function completeRedirect() {
  const q = new URLSearchParams(window.location.search);
  const code = q.get('code');
  const error = q.get('error_description') || q.get('error');
  if (!code && !error) return null;
  window.history.replaceState({}, '', window.location.pathname);
  if (error) throw new Error('Google girişi tamamlanamadı: ' + error);
  const verifier = sessionStorage.getItem(VERIFIER);
  sessionStorage.removeItem(VERIFIER);
  if (!verifier) throw new Error('Giriş oturumu bulunamadı. Lütfen tekrar deneyin.');
  const s = await tokenRequest('pkce', { auth_code: code, code_verifier: verifier });
  save(s);
  return s;
}

let refreshing = null;
/** Geçerli oturumu döndürür; süresi 60 sn içinde dolacaksa önce yeniler. */
export async function getSession() {
  const s = load();
  if (!s) return null;
  if (s.expires_at - 60 > Date.now() / 1000) return s;
  refreshing ||= tokenRequest('refresh_token', { refresh_token: s.refresh_token })
    .then((n) => (save(n), n))
    .catch(() => (save(null), null))
    .finally(() => { refreshing = null; });
  return refreshing;
}

export async function signOut() {
  const s = load();
  save(null);
  if (s) {
    fetch(`${URL_}/auth/v1/logout`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${s.access_token}` } }).catch(() => {});
  }
}
