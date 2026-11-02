// Açılış: kahraman → kaydırdıkça akan anlatım → iki yol (tek ilana CV ya da başvuru asistanı).
import React from 'react';
import { navigate } from '../router.js';
import { Shell, TopBar, Footer, CvSheetArt, EnvelopeArt, MaintenanceButton } from '../hz/ui.jsx';
import Scrolly from './landing/Scrolly.jsx';

export default function Landing() {
  return (
    <Shell>
      <TopBar>
        <MaintenanceButton className="hz-link hz-wide-only" label="Tek ilana CV hazırla" />
        <button type="button" className="hz-link" onClick={() => navigate('/otomasyon')}>Hesabına gir</button>
      </TopBar>
      <main>
        <Scrolly />

        <section className="hz-wrap">
          <div className="hz-section-title">
            <h2 className="hz-display" style={{ fontSize: 'clamp(32px, 4.4vw, 52px)', maxWidth: '15ch' }}>Bugün ne yapmak istiyorsun?</h2>
          </div>
          <div className="hz-choices">
            <div className="hz-sheet hz-choice hz-choice-off" aria-disabled="true" title="Kısa süreliğine bakımda">
              <div className="hz-choice-art"><CvSheetArt /></div>
              <div className="hz-choice-body">
                <h3 className="hz-h1">İlana göre CV hazırla</h3>
                <p>CV'ni ve başvuracağın ilanı ver. İlana göre yeniden yazılmış, ATS uyumlu CV'ni, eksik ve güçlü yönlerinle birlikte al. İstersen mülakat provası yap.</p>
                <span className="hz-btn hz-soon" aria-hidden="true"><span className="hz-soon-label">CV hazırla</span><span className="hz-soon-note">Kısa süreliğine bakımda</span></span>
              </div>
            </div>
            <button type="button" className="hz-sheet hz-choice" onClick={() => navigate('/otomasyon')}>
              <div className="hz-choice-art"><EnvelopeArt /></div>
              <div className="hz-choice-body">
                <h3 className="hz-h1">Başvuru asistanını kur</h3>
                <p>Rollerini ve şehrini bir kez seç. Asistan her gün uygun ilanları bulur, kendi CV'lerinden birini seçer, ilana özel ön yazını hazırlar ve onayınla Gmail'inden gönderir.</p>
                <span className="hz-btn hz-btn-posta">Asistanı kur</span>
              </div>
            </button>
          </div>
        </section>
      </main>
      <Footer />
    </Shell>
  );
}
