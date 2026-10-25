# Başvuru otomasyonu modülü — kurulum (Faz 0–1)

Faz 0 şunları getirir: açılış ekranındaki iki kart, `/cv` (mevcut CV aracı), `/otomasyon`
(Google ile giriş → KVKK onayı → panel + hesap içi gelen kutusu) ve sunucuda
`/api/v1/automation/*` uçları. Ürün planı: `Basvuru_Otomasyonu_Modulu_Plan.docx`.

Faz 1: Google Identity Services ile giriş (onay ekranında Supabase adresi yerine hazircv.com.tr görünür),
gizlilik politikası (`/gizlilik`) ve kullanım koşulları (`/kosullar`), kurulum sihirbazı (CV yükleme ve
profil çıkarma, rol önerisi, konum, başvuru tercihleri) ve yeni tasarım dili (`client/src/hz/`).

## Mimari kararlar

* **A1 — Supabase, bağımlılıksız.** Giriş (Google, PKCE), Postgres ve dosya deposu Supabase'de.
  İstemci ve sunucu Supabase'in HTTP API'lerini `fetch` ile kullanır (D9: yeni çalışma zamanı
  bağımlılığı yok).
* **A2 — Tarayıcı okur, sunucu yazar.** Tüm tablolarda RLS açık; tarayıcı yalnızca kendi
  satırlarını okuyabilir. Yazma işlemleri sunucudan service-role anahtarıyla yapılır ve her sorgu
  doğrulanmış kullanıcının kimliğiyle sınırlandırılır. `gmail_connections` tarayıcıya hiç açılmaz.
* **A3 — Hesap içi gelen kutusu.** E-postayla gönderilen her bildirim (günlük özet, onay bekleyen,
  gönderilen başvuru) `inbox_items` tablosuna da yazılır ve panelde görünür.
* **A5 — Giriş Google'ın kendi düğmesiyle.** `VITE_GOOGLE_CLIENT_ID` tanımlıysa Google Identity Services
  düğmesi kullanılır; Google kimlik jetonu `POST /auth/v1/token?grant_type=id_token` ile Supabase
  oturumuna çevrilir (ham nonce Supabase'e, SHA-256 özeti Google'a). Tanımlı değilse PKCE yönlendirmesine düşer.
* **A6 — CV'ler.** PDF metni tarayıcıda pdf.js ile çıkarılır; sunucu `%PDF-` imzasını ve 5 MB sınırını
  doğrular, `classify_document` ile CV olduğunu kontrol eder, `extract_profile` ile profil çıkarır ve dosyayı
  özel `cvs` kovasına `<kullanıcı>/<id>.pdf` olarak yazar. Kullanıcı başına en fazla 3 CV.
* **A7 — Tasarım dili.** Kâğıt, mürekkep ve PTT sarısı; başlıklar TeX Gyre Adventor, metin TeX Gyre Schola
  (GUST lisansı, `client/public/fonts`). Stiller `client/src/hz/hz.css` içinde, Tailwind'den bağımsız.
* **A4 — Modül kapalıyken güvenli.** `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` yoksa
  `/api/v1/automation/*` `503 NOT_CONFIGURED` döner; mevcut CV aracı etkilenmez.

## Kurulum adımları

### 1. Supabase projesi
1. supabase.com → New project. Bölge: **Central EU (Frankfurt)**.
2. **SQL Editor** → `supabase/migrations/0001_automation_init.sql` içeriğini yapıştır → **Run**.
3. **Project Settings → API**: `Project URL`, `anon public` anahtarı ve `service_role` anahtarını not et.
   `service_role` gizlidir; yalnızca Render'a girilir.

### 2. Google OAuth istemcisi
1. console.cloud.google.com → yeni proje (ör. `hazircv`).
2. **OAuth consent screen**: External, uygulama adı *Hazır CV*, destek e-postası, yetkili alan adları
   `hazircv.com.tr` ve `supabase.co`. Kapsamlar: yalnızca `openid`, `email`, `profile`
   (Gmail gönderme izni Faz 2'de eklenecek). Test kullanıcılarına kendi adresini ekle.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
   Authorized redirect URI: `https://<PROJE-REF>.supabase.co/auth/v1/callback`
4. Client ID ve Client secret'ı not et.

### 3. Supabase Auth ayarları
1. **Authentication → Sign In / Providers → Google**: etkinleştir, Client ID ve secret'ı yapıştır.
2. **Authentication → URL Configuration**:
   * Site URL: `https://hazircv.com.tr`
   * Redirect URLs: `https://hazircv.com.tr/otomasyon`, `https://www.hazircv.com.tr/otomasyon`,
     `http://localhost:5173/otomasyon`, `https://resumatch-v2-*.vercel.app/otomasyon`

### 4. Ortam değişkenleri
* **Render (API):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
* **Vercel (istemci, Production + Preview):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_GOOGLE_CLIENT_ID` (Google OAuth istemci kimliği; herkese açık bir değerdir)

### 4b. Google düğmesi için yetkili kaynaklar
Google Cloud → Clients → `hazircv-web` → **Authorized JavaScript origins**:
`https://hazircv.com.tr`, `https://www.hazircv.com.tr`, `http://localhost:5173`,
`http://localhost`, ve dal önizlemesi için `https://resumatch-v2-git-otomasyon-faz0-<ekip>.vercel.app`
(Google joker karakter kabul etmez; önizleme için dalın sabit Vercel adresi eklenir).

### 4c. Marka doğrulaması (onay ekranında "Hazır CV" adı ve logosu)
Google Auth Platform → Branding: uygulama adı, logo (120×120), ana sayfa `https://hazircv.com.tr`,
gizlilik `https://hazircv.com.tr/gizlilik`, koşullar `https://hazircv.com.tr/kosullar`, yetkili alan adı
`hazircv.com.tr` (Search Console'da doğrulanmış olmalı). Sonra Verification Center → doğrulama iste.

### 5. Yayın
1. `otomasyon-faz0` dalını gönder ve pull request aç → CI testleri ve build çalışır.
2. Vercel önizleme adresinde dene: açılış kartları, `/cv`, `/otomasyon` → Google ile giriş →
   KVKK onayı → panelde "hoş geldin" bildirimi.
3. Sorun yoksa `main`'e birleştir.

## API (Faz 0)

| Uç | Açıklama |
|---|---|
| `GET /api/v1/automation/me` | Profili döndürür; ilk girişte oluşturur ve hoş geldin bildirimi ekler |
| `PATCH /api/v1/automation/me` | `full_name`, `kvkk_accepted: true` |
| `GET /api/v1/automation/inbox` | Gelen kutusu (yeniden eskiye) |
| `POST /api/v1/automation/inbox/read` | `ids` (boş dizi = tümü) okundu işaretler |

Tüm uçlar `Authorization: Bearer <Supabase erişim anahtarı>` ister.
