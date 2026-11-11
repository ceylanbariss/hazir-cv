// Google Identity Services: "Google ile devam et" düğmesi hazircv.com.tr üzerinde açılır,
// böylece Google onay ekranında Supabase adresi değil sitemiz görünür.
// Akış: Google kimlik jetonu (ID token) → Supabase /token?grant_type=id_token.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
export const googleConfigured = Boolean(CLIENT_ID);

let loading;
function loadScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => { loading = null; reject(new Error('Google girişi yüklenemedi. Bağlantını kontrol edip sayfayı yenile.')); };
    document.head.appendChild(s);
  });
  return loading;
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

const NONCE_KEY = 'hazircv.gsi.nonce';

// Yönlendirme modu, giriş adresi (…/api/v1/automation/google/callback) Google Cloud'da OAuth istemcisinin
// "Yetkilendirilmiş yönlendirme URI'leri" listesine eklendikten sonra açılır; eklenmeden açılırsa Google hata verir.
const GSI_REDIRECT_ENABLED = true;

/** Telefon ve tabletlerde açılır pencere (popup) güvenilir değil: aynı sekmede yönlendirme kullanılır. */
export const useRedirectMode = () => {
  try {
    const forced = sessionStorage.getItem('hazircv.gsi.mode'); // test için: 'redirect' | 'popup'
    if (forced) return forced === 'redirect';
  } catch { /* özel pencere */ }
  if (!GSI_REDIRECT_ENABLED) return false;
  try {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
};

/** Uygulama içi tarayıcılar (Instagram, Facebook, LinkedIn, TikTok, Android WebView…): Google girişi orada engellenir. */
export function inAppBrowser() {
  const ua = navigator.userAgent || '';
  if (/FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|musical_ly|TikTok|Snapchat|Line\/|MicroMessenger|Twitter/i.test(ua)) return true;
  return /Android/i.test(ua) && /; wv\)/.test(ua);
}

/**
 * Google düğmesini `el` içine çizer. Kullanıcı giriş yapınca onCredential({ idToken, nonce }) çağrılır.
 * Ham nonce Supabase'e, SHA-256 özeti Google'a verilir (yeniden oynatma koruması).
 * Telefonda yönlendirme modu: Google jetonu sunucuya POST eder, sunucu /otomasyon#gsi=… adresine döndürür
 * ve takeGsiRedirect() ile oturum açılır.
 */
export async function renderGoogleButton(el, onCredential, { width = 320 } = {}) {
  await loadScript();
  const nonce = crypto.randomUUID() + crypto.randomUUID();
  const hashed = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)));
  const redirect = useRedirectMode();
  if (redirect) {
    try { sessionStorage.setItem(NONCE_KEY, nonce); localStorage.setItem(NONCE_KEY, nonce); } catch { /* özel pencere */ }
  }
  window.google.accounts.id.initialize({
    client_id: CLIENT_ID,
    nonce: hashed,
    itp_support: true,
    ...(redirect
      ? { ux_mode: 'redirect', login_uri: `${window.location.origin}/api/v1/automation/google/callback` }
      : { ux_mode: 'popup', use_fedcm_for_button: true, callback: (res) => onCredential({ idToken: res.credential, nonce }) }),
  });
  window.google.accounts.id.renderButton(el, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', logo_alignment: 'left', locale: 'tr', width });
}

/** Yönlendirme dönüşü: #gsi=<jeton> → { idToken, nonce }; #gsi_error=… → { error }; yoksa null. Adres hemen temizlenir. */
export function takeGsiRedirect() {
  const h = new URLSearchParams(window.location.hash.slice(1));
  const idToken = h.get('gsi');
  const error = h.get('gsi_error');
  if (!idToken && !error) return null;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  let nonce = null;
  try {
    nonce = sessionStorage.getItem(NONCE_KEY) || localStorage.getItem(NONCE_KEY);
    sessionStorage.removeItem(NONCE_KEY);
    localStorage.removeItem(NONCE_KEY);
  } catch { /* özel pencere */ }
  if (error || !nonce) return { error: 'Google girişi tamamlanamadı. Lütfen tekrar dene.' };
  return { idToken, nonce };
}
