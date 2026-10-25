// Açılış ekranı: iki yol — tek bir ilana CV hazırlamak ya da her gün çalışan başvuru asistanı.
import React from 'react';
import { navigate } from '../router.js';
import { Shell, TopBar, Footer, CvSheetArt, EnvelopeArt } from '../hz/ui.jsx';

export default function Landing() {
  return (
    <Shell>
      <TopBar>
        <button type="button" className="hz-link" onClick={() => navigate('/otomasyon')}>Hesabına gir</button>
      </TopBar>
      <main className="hz-wrap">
        <section className="hz-hero">
          <h1 className="hz-display" style={{ maxWidth: '15ch' }}>Bugün ne yapmak istiyorsun?</h1>
          <p className="hz-lead">Tek bir ilana göre CV'ni hazırlayabilir ya da her gün sana uygun ilanları bulup başvuruları hazırlayan asistanı kurabilirsin.</p>
        </section>
        <div className="hz-choices">
          <button type="button" className="hz-sheet hz-choice" onClick={() => navigate('/cv')}>
            <div className="hz-choice-art"><CvSheetArt /></div>
            <div className="hz-choice-body">
              <h2 className="hz-h1">İlana göre CV hazırla</h2>
              <p>CV'ni ve başvuracağın ilanı ver. İlana göre yeniden yazılmış, ATS uyumlu CV'ni, eksik ve güçlü yönlerinle birlikte al. İstersen mülakat provası yap.</p>
              <span className="hz-btn">CV hazırla</span>
            </div>
          </button>
          <button type="button" className="hz-sheet hz-choice" onClick={() => navigate('/otomasyon')}>
            <div className="hz-choice-art"><EnvelopeArt /></div>
            <div className="hz-choice-body">
              <h2 className="hz-h1">Başvuru asistanını kur</h2>
              <p>Rollerini ve şehrini bir kez seç. Asistan her gün uygun ilanları bulur, kendi CV'lerinden birini seçer, ilana özel ön yazını hazırlar ve onayınla Gmail'inden gönderir.</p>
              <span className="hz-btn hz-btn-posta">Asistanı kur</span>
            </div>
          </button>
        </div>
      </main>
      <Footer />
    </Shell>
  );
}
