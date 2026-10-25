// Kaydırdıkça akan anlatım: asistanın bir günü, altı sahnede.
// Sahne seçimi React'te (yalnızca sahne değişince), sahne içi hareket CSS'te --lp (0..1) ile.
import React, { useEffect, useRef, useState } from 'react';

const SCENES = [
  { title: 'CV\'ni yükle', text: 'PDF olarak yüklediğin CV okunur; deneyimin, becerilerin ve kıdemin çıkarılır. Asistan CV yazmaz, her başvuruda senin CV\'lerinden birini ekler.' },
  { title: 'Ne aradığını söyle', text: 'Rollerini ve şehirlerini seç. Asistan CV\'ne bakıp gözden kaçırdığın benzer rolleri de önerir.' },
  { title: 'Her gün öğlen tarama', text: 'Şirket kariyer sayfaları, e-postayla başvuru alan ilanlar ve iş alarmların taranır. Her ilan CV\'ne göre puanlanır, uymayanlar elenir.' },
  { title: 'İlana özel ön yazı', text: 'Uygun ilanlar için ön yazın yazılır. Yalnızca CV\'nde olan bilgiler kullanılır; uydurma deneyim ya da rakam eklenmez.' },
  { title: 'Sen onayla, Gmail\'inden gitsin', text: 'Ön yazıyı okursun, tek tıkla onaylarsın. Başvuru CV\'n ekli olarak kendi Gmail adresinden şirkete gider.' },
  { title: 'Hepsi hesabında', text: 'Gönderilen başvurular, gelen dönüşler ve günlük özet hem e-postana hem de hesabındaki gelen kutusuna düşer.' },
];

const v = (i) => ({ '--i': i });

function SceneCv() {
  return (
    <div className="sc sc-cv">
      <div className="sc-drop">
        <div className="sc-pdf">
          <span className="sc-pdf-tag">PDF</span>
          <i /><i /><i className="s" /><i /><i className="s" /><i />
        </div>
      </div>
      <div className="sc-profile">
        <p className="sc-k" style={v(2)}>İş Analisti, yeni mezun, Eskişehir</p>
        <div className="sc-chips">
          {['SQL', 'Jira', 'BPMN', 'Scrum', 'Excel', 'Python'].map((s, i) => <span key={s} style={v(3 + i * 0.5)}>{s}</span>)}
        </div>
      </div>
    </div>
  );
}

function SceneRoles() {
  return (
    <div className="sc sc-roles">
      <p className="sc-label">Roller</p>
      <div className="sc-chips sc-chips-on">
        {['İş Analisti', 'Business Analyst', 'ERP Danışmanı'].map((s, i) => <span key={s} style={v(1 + i)}>{s}</span>)}
      </div>
      <div className="sc-suggest" style={v(4)}>
        <div><strong>Ürün Analisti</strong><span>Jira ve gereksinim analizi deneyiminle uyumlu.</span></div>
        <b>Ekle</b>
      </div>
      <p className="sc-label" style={{ marginTop: 18 }}>Şehirler</p>
      <div className="sc-chips sc-chips-on">
        {['Eskişehir', 'İstanbul', 'Uzaktan'].map((s, i) => <span key={s} style={v(5 + i * 0.6)}>{s}</span>)}
      </div>
    </div>
  );
}

const JOBS = [
  ['Atlas Yazılım', 'Jr. İş Analisti', 92],
  ['Kuzey ERP', 'ERP Danışmanı', 86],
  ['Nova Dijital', 'Business Analyst', 79],
  ['Vega AI', 'Makine Öğrenmesi Mühendisi', 38],
];

function SceneScan() {
  return (
    <div className="sc sc-scan">
      <div className="sc-clock" aria-hidden="true">
        <svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="36" /><line className="sc-hand-h" x1="40" y1="40" x2="40" y2="20" /><line className="sc-hand-m" x1="40" y1="40" x2="40" y2="12" /></svg>
        <span>12:00</span>
      </div>
      <ul className="sc-jobs">
        {JOBS.map(([c, r, s], i) => (
          <li key={c} style={v(1 + i * 1.3)} data-out={s < 60 || undefined}>
            <span className="sc-score">{s}</span>
            <span><strong>{r}</strong><em>{c}</em></span>
            <span className="sc-verdict">{s < 60 ? 'elendi' : 'uygun'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const LETTER = [
  'Merhaba Atlas Yazılım ekibi,',
  'Jr. İş Analisti ilanınızı gördüm. Sakarya Üniversitesi',
  'Bilişim Sistemleri Mühendisliği mezunuyum ve stajımda',
  'SQL ve Jira ile gereksinim analizi yaptım.',
  'Ekibinize katkı sunmak isterim; CV\'m ektedir.',
  'Saygılarımla, Elif',
];

function SceneLetter() {
  return (
    <div className="sc sc-letter">
      <div className="sc-paper">
        <p className="sc-subject">Konu: Jr. İş Analisti başvurusu – Elif Kaya</p>
        {LETTER.map((l, i) => <p key={i} style={v(1 + i)} className="sc-line">{l}</p>)}
        <p className="sc-attach" style={v(7)}>Ek: Elif_Kaya_CV.pdf</p>
      </div>
    </div>
  );
}

function SceneSend() {
  return (
    <div className="sc sc-send">
      <div className="sc-env">
        <div className="sc-mini-letter"><i /><i /><i className="s" /><i /></div>
        <svg className="sc-env-svg" viewBox="0 0 300 190" aria-hidden="true">
          <rect x="2" y="2" width="296" height="186" rx="3" />
          <path d="M2 4 L150 110 L298 4" />
        </svg>
        <div className="sc-stamp" aria-hidden="true"><span>12:00</span></div>
      </div>
      <div className="sc-approve"><span>Onayla ve gönder</span></div>
      <p className="sc-sent">Gönderildi: ik@atlasyazilim.com.tr</p>
    </div>
  );
}

const INBOX = [
  ['Günlük özet', '3 başvuru gönderildi, 12 yeni ilan listelendi.'],
  ['Atlas Yazılım\'dan dönüş', 'Ön görüşme için uygun olduğunuz saatleri paylaşır mısınız?'],
  ['Onay bekleyen 2 başvuru', 'Kuzey ERP ve Nova Dijital için ön yazılar hazır.'],
];

function SceneInbox() {
  return (
    <div className="sc sc-inbox">
      <p className="sc-label">Gelen kutusu</p>
      <ul>
        {INBOX.map(([t, b], i) => (
          <li key={t} style={v(1 + i * 1.5)}><strong>{t}</strong><span>{b}</span></li>
        ))}
      </ul>
    </div>
  );
}

const VISUALS = [SceneCv, SceneRoles, SceneScan, SceneLetter, SceneSend, SceneInbox];

export default function Scrolly() {
  const section = useRef(null);
  const stage = useRef(null);
  const [scene, setScene] = useState(0);
  const sceneRef = useRef(0);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = section.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const p = Math.min(Math.max(-r.top / total, 0), 0.9999);
      const n = SCENES.length;
      const idx = Math.floor(p * n);
      const lp = p * n - idx;
      stage.current?.style.setProperty('--lp', lp.toFixed(4));
      stage.current?.style.setProperty('--p', p.toFixed(4));
      if (idx !== sceneRef.current) { sceneRef.current = idx; setScene(idx); }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); };
  }, []);

  return (
    <section ref={section} className="sx" style={{ height: `${SCENES.length * 90 + 100}vh` }} aria-label="Başvuru asistanı nasıl çalışır">
      <div ref={stage} className="sx-stage" data-scene={scene}>
        <div className="hz-wrap sx-grid">
          <div className="sx-copy">
            <ol className="sx-rail" aria-hidden="true">
              {SCENES.map((s, i) => <li key={s.title} data-on={i <= scene || undefined} />)}
            </ol>
            {SCENES.map((s, i) => (
              <div key={s.title} className="sx-text" data-active={i === scene || undefined} aria-hidden={i !== scene}>
                <p className="sx-step">Adım {i + 1} / {SCENES.length}</p>
                <h2 className="hz-display sx-title">{s.title}</h2>
                <p className="hz-lead">{s.text}</p>
              </div>
            ))}
          </div>
          <div className="sx-visual hz-sheet">
            {VISUALS.map((V, i) => (
              <div key={i} className="sx-layer" data-active={i === scene || undefined} aria-hidden="true"><V /></div>
            ))}
          </div>
        </div>
      </div>
      {/* Hareketi kapatanlar ve ekran okuyucular için düz liste */}
      <ol className="sx-static">
        {SCENES.map((s, i) => <li key={s.title}><h2 className="hz-h2">{i + 1}. {s.title}</h2><p className="hz-muted">{s.text}</p></li>)}
      </ol>
    </section>
  );
}
