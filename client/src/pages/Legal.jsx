// Gizlilik politikası ve kullanım koşulları. Google marka doğrulaması ve KVKK için gerekli.
// Not: Taslak metindir; yayından önce gözden geçirilmelidir.
import React from 'react';
import { Shell, TopBar, Footer } from '../hz/ui.jsx';

export const CONTACT_EMAIL = 'bcey2603@gmail.com';
const UPDATED = '10 Kasım 2026';

function Doc({ title, children }) {
  return (
    <Shell>
      <TopBar />
      <main className="hz-wrap hz-doc">
        <article>
          <h1 className="hz-h1">{title}</h1>
          <p className="hz-small">Son güncelleme: {UPDATED}</p>
          {children}
        </article>
      </main>
      <Footer />
    </Shell>
  );
}

export function Privacy() {
  return (
    <Doc title="Gizlilik politikası">
      <p>Bu metin, Hazır CV'nin (hazircv.com.tr) hangi kişisel verileri neden işlediğini ve bu veriler üzerindeki haklarını 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında açıklar.</p>

      <h2>İlana göre CV hazırlama</h2>
      <p>Bu araç hesap gerektirmez. Yüklediğin CV ve girdiğin ilan metni, sonucu üretmek için sunucumuza ve yapay zeka hizmetine (Google Gemini API) gönderilir. Bu içerikler hesabına kaydedilmez ve analiz tamamlandıktan sonra tarafımızca saklanmaz.</p>

      <h2>Başvuru asistanı</h2>
      <p>Asistanı kullanmak için Google hesabınla giriş yaparsın. Bu bölümde şu verileri işleriz:</p>
      <ul>
        <li>Google hesabından gelen adın, e-posta adresin ve profil fotoğrafın.</li>
        <li>Yüklediğin CV dosyaları ve bunlardan çıkarılan profil bilgisi (deneyim, eğitim, beceriler).</li>
        <li>Seçtiğin roller, şehirler, çalışma şekli ve başvuru tercihlerin.</li>
        <li>Bulunan ilanlar, hazırlanan ön yazılar, gönderilen başvuruların kaydı ve durumları.</li>
        <li>Gmail bağlantısını kurarsan, yalnızca senin adına e-posta göndermeye yarayan erişim anahtarı. Bu anahtar şifrelenerek saklanır.</li>
        <li>Asistana yönlendirdiğin iş alarmı e-postaları (LinkedIn, Kariyer.net vb.).</li>
      </ul>

      <h2>Verileri hangi amaçla kullanırız</h2>
      <p>Verilerini yalnızca sana uygun ilanları bulmak, ilana özel ön yazı hazırlamak, onayınla ya da seçtiğin otomatik modda başvuru e-postası göndermek ve sana günlük özet sunmak için kullanırız. Verilerini satmayız, reklam için kullanmayız ve yapay zeka modellerini eğitmek için kimseyle paylaşmayız.</p>

      <h2>Google kullanıcı verileri</h2>
      <p>Hazır CV'nin Google API'lerinden aldığı bilgileri kullanması ve başka uygulamalara aktarması, sınırlı kullanım (Limited Use) koşulları dahil olmak üzere <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Hizmetleri Kullanıcı Verileri Politikası</a>'na uygundur. Gmail iznini yalnızca senin adına başvuru e-postası göndermek için kullanırız; gelen kutunu okumayız.</p>

      <h2>Google kullanıcı verilerini kimlerle paylaşırız</h2>
      <p>Google hesabından aldığımız veriler (adın, e-posta adresin, profil fotoğrafın ve Gmail gönderme izni) satılmaz, kiralanmaz ve reklam, profil çıkarma ya da yapay zeka modeli eğitimi için hiçbir üçüncü tarafla paylaşılmaz. Bu veriler yalnızca aşağıdaki durumlarda ve yalnızca hizmeti sunmak için gereken ölçüde aktarılır:</p>
      <ul>
        <li><strong>Başvuru yaptığın işveren:</strong> onayladığın başvuru e-postası, Gmail hesabından, senin adın ve e-posta adresinle yalnızca seçtiğin alıcıya gönderilir.</li>
        <li><strong>Google (Gmail API):</strong> e-postanın gönderilmesi için Google'ın kendi sunucularına iletilir.</li>
        <li><strong>Google (Gemini API):</strong> ön yazıda imza olarak kullanılması için yalnızca adın, ön yazıyı hazırlayan yapay zeka hizmetine gönderilir. E-posta adresin, Gmail erişim anahtarın ve Gmail içeriğin bu hizmete gönderilmez.</li>
        <li><strong>Altyapı sağlayıcıları:</strong> Supabase (veritabanı ve kimlik doğrulama, AB-İrlanda) ve Render (sunucu) verileri yalnızca bizim adımıza, saklamak ve işlemek için tutar; kendi amaçları için kullanamaz.</li>
        <li><strong>Yasal zorunluluk:</strong> yalnızca yürürlükteki bir yasa ya da mahkeme kararı gerektirirse.</li>
      </ul>
      <p>Gelen kutunu, diğer e-postalarını, kişilerini veya takvimini okumayız; bu verilere erişim izni de istemeyiz.</p>

      <h2>Verilerini nasıl koruruz</h2>
      <ul>
        <li><strong>Şifreleme:</strong> Gmail erişim anahtarın (refresh token) veritabanında AES-256-GCM ile şifrelenmiş olarak saklanır. Şifre çözme anahtarı yalnızca sunucunun gizli ortam değişkeninde durur, veritabanında bulunmaz.</li>
        <li><strong>İletimde şifreleme:</strong> tarayıcın, sunucumuz, veritabanı ve Google arasındaki tüm trafik HTTPS/TLS ile şifrelenir.</li>
        <li><strong>Erişim kısıtlaması:</strong> veritabanında satır düzeyinde güvenlik (RLS) açıktır; her kullanıcı yalnızca kendi kayıtlarını görebilir. Gmail bağlantı tablosuna tarayıcıdan hiç erişilemez; yalnızca sunucu yetkili anahtarla erişir. Yönetim anahtarları yalnızca sunucuda tutulur.</li>
        <li><strong>En az yetki:</strong> Gmail için yalnızca "e-posta gönderme" (gmail.send) izni istenir. Giriş akışındaki güvenlik parametreleri HMAC ile imzalanır.</li>
        <li><strong>Silme ve iptal:</strong> Gmail bağlantısını kaldırdığında erişim anahtarın Google nezdinde iptal edilir ve veritabanından silinir. Hesabını sildiğinde tüm verilerin silinir.</li>
      </ul>

      <h2>Hizmet sağlayıcılar</h2>
      <ul>
        <li>Supabase: kimlik doğrulama, veritabanı ve dosya depolama (Avrupa Birliği, İrlanda).</li>
        <li>Google: giriş, Gmail ile gönderim ve Gemini yapay zeka hizmeti.</li>
        <li>Vercel ve Render: web sitesinin ve sunucunun barındırılması.</li>
      </ul>
      <p>Bu sağlayıcılar verileri yurt dışındaki sunucularda işleyebilir. Asistanı kurarken verdiğin açık rıza bu aktarımı kapsar.</p>

      <h2>Saklama süresi ve silme</h2>
      <p>Verilerin hesabın açık olduğu sürece saklanır. Ayarlar bölümünden otomasyonu durdurabilir, Gmail bağlantısını kaldırabilir ve hesabını tüm verileriyle silebilirsin. Google hesabının güvenlik ayarlarından Hazır CV'nin erişimini istediğin an iptal edebilirsin.</p>

      <h2>Google user data — summary in English</h2>
      <p><strong>Data accessed:</strong> name, email address and profile picture (Google Sign-In) and the gmail.send scope, used only to send job application e-mails the user has approved. We never read the user's inbox.</p>
      <p><strong>Sharing:</strong> Google user data is not sold, rented or shared with third parties for advertising, profiling or AI model training. It is disclosed only (1) to the employer the user chose, as the sender of the approved application e-mail; (2) to Google's Gmail API to deliver that e-mail; (3) the user's name only, to Google's Gemini API to sign the cover letter; (4) to our infrastructure processors Supabase (EU) and Render, which store and process it solely on our behalf; and (5) where required by law.</p>
      <p><strong>Protection:</strong> Gmail refresh tokens are encrypted at rest with AES-256-GCM, with the key held only in server environment secrets; all traffic uses HTTPS/TLS; the database enforces row-level security so users can only access their own rows and the Gmail token table is not reachable from the browser; we request the minimum scope (gmail.send); OAuth state is HMAC-signed; disconnecting Gmail revokes the token with Google and deletes it, and account deletion removes all data.</p>
      <p>Hazır CV's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>

      <h2>Hakların</h2>
      <p>KVKK'nın 11. maddesi uyarınca verilerinin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini veya silinmesini isteme ve işlemeye itiraz etme hakların vardır. Taleplerin için <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> adresine yazabilirsin.</p>
    </Doc>
  );
}

export function Terms() {
  return (
    <Doc title="Kullanım koşulları">
      <p>Hazır CV'yi kullanarak bu koşulları kabul etmiş olursun.</p>
      <h2>Hizmet</h2>
      <p>Hazır CV ücretsiz bir kariyer aracıdır: ilana göre CV hazırlar ve başvuru asistanı ile senin için ilan bulup başvuru e-postası hazırlar. Hizmet olduğu gibi sunulur; kesintisiz çalışacağını veya bir işe kabul edileceğini garanti etmez.</p>
      <h2>Senin sorumlulukların</h2>
      <ul>
        <li>Yüklediğin CV'lerdeki bilgilerin doğru olması ve sana ait olması.</li>
        <li>Onayladığın ya da otomatik modda gönderilmesine izin verdiğin başvuru e-postalarının içeriği.</li>
        <li>Hizmeti istenmeyen e-posta (spam) göndermek, başkası adına başvuru yapmak veya yasa dışı amaçlarla kullanmamak.</li>
      </ul>
      <h2>Yapay zeka çıktıları</h2>
      <p>Ön yazılar ve CV önerileri yapay zeka ile hazırlanır ve yalnızca CV'ndeki bilgilere dayanacak şekilde denetlenir. Göndermeden önce gözden geçirmeni öneririz.</p>
      <h2>Limitler</h2>
      <p>Ücretsiz hizmeti herkes için sürdürebilmek amacıyla günlük başvuru ve analiz sayısı sınırlandırılabilir.</p>
      <h2>Değişiklikler ve iletişim</h2>
      <p>Bu koşullar güncellenebilir; önemli değişiklikleri hesabındaki gelen kutusundan duyururuz. Sorular için <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </Doc>
  );
}
