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

/**
 * Google düğmesini `el` içine çizer. Kullanıcı giriş yapınca onCredential({ idToken, nonce }) çağrılır.
 * Ham nonce Supabase'e, SHA-256 özeti Google'a verilir (yeniden oynatma koruması).
 */
export async function renderGoogleButton(el, onCredential, { width = 320 } = {}) {
  await loadScript();
  const nonce = crypto.randomUUID() + crypto.randomUUID();
  const hashed = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)));
  window.google.accounts.id.initialize({
    client_id: CLIENT_ID,
    nonce: hashed,
    ux_mode: 'popup',
    itp_support: true,
    use_fedcm_for_button: true,
    callback: (res) => onCredential({ idToken: res.credential, nonce }),
  });
  window.google.accounts.id.renderButton(el, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', logo_alignment: 'left', locale: 'tr', width });
}
