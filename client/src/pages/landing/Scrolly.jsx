// Kaydırdıkça akan açılış: yapay zekayla üretilmiş gerçekçi masa fotoğrafları + içlerine yerleştirilen gerçek arayüz.
// Fotoğraflar 1376×768 yerel koordinatlı bir "tuval"de durur; tuval, sahneyi odak noktasına göre kaplayacak
// şekilde ölçeklenir. Ekran içi arayüz, boş ekran dörtgenine homografi (matrix3d) ile oturtulur.
import React, { useEffect, useRef, useState } from 'react';
import { navigate } from '../../router.js';

// Görseller: yerel çözünürlük (w×h) ve varsa boş ekranın köşeleri (sol üst, sağ üst, sağ alt, sol alt).
const IMAGES = {
  masa: { src: 'masa', w: 2576, h: 1438, quad: [[1608, 434], [2273, 475], [2164, 1038], [1519, 883]] },
  cv: { src: 'cv', w: 2576, h: 1438 },
  zarf: { src: 'zarf', w: 2576, h: 1438 },
  telefon: { src: 'telefon', w: 2576, h: 1438, quad: [[1209, 382], [1494, 426], [1380, 1084], [1078, 1022]] },
  telefonDikey: { src: 'telefon-dikey', w: 1438, h: 2576, quad: [[665, 1135], [938, 1189], [832, 1809], [553, 1745]] },
};
const srcOf = (key, wide) => `/img/acilis/${IMAGES[key].src}${wide ? '' : '-1600'}.webp`;
// Fotoğraf üstü kartlar 1376 px genişliğe göre tasarlandı; büyük görselde orantılı büyütülür.
const kart = (key) => IMAGES[key].w / 1376;

const STEPS = [
  { img: 'masa', focal: [0.7, 0.5], zoom: [1, 1.08], ui: 'home', hero: true },
  { img: 'cv', focal: [0.5, 0.57], zoom: [1.02, 1.12], title: 'CV\'ni yükle', text: 'PDF olarak yüklediğin CV okunur; deneyimin, becerilerin ve kıdemin çıkarılır. Asistan CV yazmaz, her başvuruda senin CV\'lerinden birini ekler.' },
  { img: 'masa', focal: [0.73, 0.5], zoom: [1.12, 1.24], ui: 'roles', title: 'Ne aradığını söyle', text: 'Rollerini ve şehirlerini seç. Asistan CV\'ne bakıp gözden kaçırdığın benzer rolleri de önerir.' },
  { img: 'masa', focal: [0.73, 0.5], zoom: [1.24, 1.36], ui: 'scan', title: 'Her gün öğlen tarama', text: 'Şirket kariyer sayfaları, e-postayla başvuru alan ilanlar ve iş alarmların taranır. Her ilan CV\'ne göre puanlanır, uymayanlar elenir.' },
  { img: 'masa', focal: [0.73, 0.5], zoom: [1.36, 1.48], ui: 'letter', title: 'İlana özel ön yazı', text: 'Uygun ilanlar için ön yazın yazılır. Yalnızca CV\'nde olan bilgiler kullanılır; uydurma deneyim ya da rakam eklenmez.' },
  { img: 'zarf', focal: [0.64, 0.6], zoom: [1.04, 1.14], title: 'Sen onayla, Gmail\'inden gitsin', text: 'Ön yazıyı okursun, tek tıkla onaylarsın. Başvuru CV\'n ekli olarak kendi Gmail adresinden şirkete gider.' },
  { img: 'telefon', imgNarrow: 'telefonDikey', focal: [0.5, 0.52], focalNarrow: [0.52, 0.57], zoom: [1.04, 1.16], ui: 'phone', title: 'Hepsi hesabında', text: 'Gönderilen başvurular, gelen dönüşler ve günlük özet hem e-postana hem de hesabındaki gelen kutusuna düşer.' },
];
const NARRATIVE = STEPS.filter((s) => !s.hero);

/** (0,0)-(w,h) dikdörtgenini dörtgene eşleyen CSS matrix3d. */
function homography(w, h, q) {
  const src = [[0, 0], [w, 0], [w, h], [0, h]];
  const A = [], B = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = q[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
  }
  for (let c = 0; c < 8; c++) { // Gauss eleme
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [B[c], B[p]] = [B[p], B[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      B[r] -= f * B[c];
    }
  }
  const [a, b, c, d, e, f, g, hh] = B.map((v, i) => v / A[i][i]);
  return `matrix3d(${a},${d},0,${g},${b},${e},0,${hh},0,0,1,0,${c},${f},0,1)`;
}
const LAPTOP_M = homography(800, 500, IMAGES.masa.quad);
const PHONE_M = { telefon: homography(360, 780, IMAGES.telefon.quad), telefonDikey: homography(360, 780, IMAGES.telefonDikey.quad) };
const imgFor = (s, wide) => (!wide && s.imgNarrow) || s.img;

const v = (i) => ({ '--i': i });

function LaptopUi({ ui }) {
  const on = (k) => (ui === k ? 'px-ui on' : 'px-ui');
  return (
    <div className="px-screen" style={{ transform: LAPTOP_M }} aria-hidden="true">
      <div className="px-ui-top"><b>Hazır CV</b><span>Elif Kaya</span></div>
      <div className={on('home')}>
        <p className="px-ui-h">Günaydın Elif</p>
        <div className="px-ui-card"><strong>Bugün 3 başvuru hazır</strong><span>Öğlen taraması tamamlandı. Onayını bekliyorlar.</span><i>Başvurulara bak</i></div>
      </div>
      <div className={on('roles')}>
        <p className="px-ui-h">Hangi işlere başvuralım?</p>
        <div className="px-chips">{['İş Analisti', 'Business Analyst', 'ERP Danışmanı'].map((s, i) => <span key={s} style={v(1 + i)}>{s}</span>)}</div>
        <div className="px-ui-row" style={{ ...v(4), gridTemplateColumns: '1fr auto' }}><span><strong>Ürün Analisti</strong><em>Jira ve gereksinim analizi deneyiminle uyumlu.</em></span><i>Ekle</i></div>
        <div className="px-chips">{['Eskişehir', 'İstanbul', 'Uzaktan'].map((s, i) => <span key={s} style={v(5 + i * 0.7)}>{s}</span>)}</div>
      </div>
      <div className={on('scan')}>
        <p className="px-ui-h">Onay bekleyenler</p>
        {[['92', 'Jr. İş Analisti', 'Atlas Yazılım'], ['86', 'ERP Danışmanı', 'Kuzey ERP'], ['79', 'Business Analyst', 'Nova Dijital'], ['38', 'Makine Öğrenmesi Mühendisi', 'Vega AI']].map(([s, r, c], i) => (
          <div className="px-ui-row" key={c} style={v(1 + i * 1.6)} data-out={Number(s) < 60 || undefined}>
            <b>{s}</b><span><strong>{r}</strong><em>{c}</em></span><i>{Number(s) < 60 ? 'Elendi' : 'Onayla'}</i>
          </div>
        ))}
      </div>
      <div className={on('letter')}>
        <div className="px-letter">
          <p className="px-subject">Konu: Jr. İş Analisti başvurusu – Elif Kaya</p>
          {['Merhaba Atlas Yazılım ekibi,', 'Jr. İş Analisti ilanınızı gördüm. Bilişim Sistemleri Mühendisliği mezunuyum; stajımda SQL ve Jira ile gereksinim analizi yaptım.', 'Ekibinize katkı sunmak isterim, CV\'m ektedir.', 'Saygılarımla, Elif'].map((l, i) => <p key={i} style={v(1 + i * 1.5)}>{l}</p>)}
          <span className="px-attach" style={v(7)}>Ek: Elif_Kaya_CV.pdf</span>
        </div>
      </div>
    </div>
  );
}

function PhoneUi({ which }) {
  return (
    <div className="px-phone" style={{ transform: PHONE_M[which] }} aria-hidden="true">
      <div className="px-phone-time">12:06<small>Pazartesi, 26 Ekim</small></div>
      <div className="px-phone-list">
        <div className="px-notif" style={v(1)}><b>Hazır CV</b><span>3 başvuru gönderildi: Atlas Yazılım, Kuzey ERP, Nova Dijital</span></div>
        <div className="px-notif" style={v(3)}><b>E-posta</b><span>Atlas Yazılım: Ön görüşme daveti</span></div>
        <div className="px-notif" style={v(5)}><b>Hazır CV</b><span>Günlük özet hazır: 12 yeni ilan</span></div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <div className="px-hero">
      <h1 className="hz-display">Her gün öğlen, başvuruların hazır.</h1>
      <p className="hz-lead">Hazır CV asistanı sana uygun ilanları bulur, kendi CV'lerinden birini seçer ve ilana özel ön yazını hazırlar. Sen onaylarsın, başvuru Gmail'inden gider. Ücretsiz.</p>
      <div className="hz-hero-cta">
        <button type="button" className="hz-btn hz-btn-posta" onClick={() => navigate('/otomasyon')}>Asistanı kur</button>
        <button type="button" className="hz-btn px-btn-light" onClick={() => navigate('/cv')}>Tek ilana CV hazırla</button>
      </div>
      <span className="hz-scroll-hint">Nasıl çalıştığını görmek için kaydır</span>
    </div>
  );
}

export default function Scrolly() {
  const section = useRef(null);
  const stage = useRef(null);
  const canvases = useRef({});
  const [step, setStep] = useState(0);
  const stepRef = useRef(0);
  const [wide, setWide] = useState(() => typeof window === 'undefined' || window.innerWidth > 820);

  useEffect(() => {
    let raf = 0;
    const place = (idx, lp) => {
      const s = STEPS[idx];
      const st = stage.current;
      if (!st) return;
      const W = st.clientWidth, H = st.clientHeight;
      const key = imgFor(s, W > 820);
      const el = canvases.current[key];
      if (!el) return;
      const { w: IW, h: IH } = IMAGES[key];
      const focal = (W <= 820 && s.focalNarrow) || s.focal;
      const z = s.zoom[0] + (s.zoom[1] - s.zoom[0]) * lp;
      // Masaüstünde fotoğraf sahneyi kaplar, nesne sağa (yazı solda) yerleşir.
      // Mobilde fotoğraf ekranın üst %60'ını kaplar, yazı altta kalır.
      const wide = W > 820;
      const scale = (wide ? Math.max(W / IW, H / IH) : Math.max(W / IW, (H * 0.6) / IH)) * z;
      const cw = IW * scale, ch = IH * scale;
      const left = Math.min(0, Math.max(W - cw, W * (wide ? 0.68 : 0.5) - focal[0] * cw));
      const top = wide ? Math.min(0, Math.max(H - ch, H * 0.5 - focal[1] * ch)) : Math.min(0, Math.max(H * 0.6 - ch, H * 0.3 - focal[1] * ch));
      el.style.transform = `translate3d(${left}px, ${top}px, 0) scale(${scale})`;
    };
    const update = () => {
      raf = 0;
      const el = section.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const p = Math.min(Math.max(-r.top / total, 0), 0.9999);
      const n = STEPS.length;
      const idx = Math.floor(p * n);
      const lp = p * n - idx;
      stage.current.style.setProperty('--lp', lp.toFixed(4));
      place(idx, lp);
      if (idx !== stepRef.current) { stepRef.current = idx; setStep(idx); }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    const onResize = () => { setWide(window.innerWidth > 820); onScroll(); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize); cancelAnimationFrame(raf); };
  }, []);
  useEffect(() => { window.dispatchEvent(new Event('scroll')); }, [wide]);

  const cur = STEPS[step];
  const curImg = imgFor(cur, wide);
  const narrIdx = NARRATIVE.indexOf(cur);

  return (
    <section ref={section} className="px" style={{ height: `${STEPS.length * 85 + 100}vh` }} aria-label="Başvuru asistanı nasıl çalışır">
      <div ref={stage} className="px-stage" data-step={step}>
        {Object.entries(IMAGES).map(([key, img]) => (
          <div key={key} className="px-layer" data-on={curImg === key || undefined}>
            <div className="px-canvas" style={{ width: img.w, height: img.h }} ref={(n) => { canvases.current[key] = n; }}>
              <img src={srcOf(key, wide)} alt="" width={img.w} height={img.h} style={{ width: img.w, height: img.h }} decoding="async" fetchpriority={key === 'masa' ? 'high' : 'low'} />
              {key === 'masa' && <LaptopUi ui={cur.ui || 'home'} />}
              {(key === 'telefon' || key === 'telefonDikey') && <PhoneUi which={key} />}
              {key === 'cv' && (
                <div className="px-float" style={{ left: 1330, top: 300, transform: `scale(${kart(key)})` }} aria-hidden="true">
                  <p style={v(2)}>Profil çıkarıldı</p>
                  <strong style={v(3)}>İş Analisti, yeni mezun</strong>
                  <div className="px-chips">{['SQL', 'Jira', 'BPMN', 'Scrum', 'Excel'].map((s, i) => <span key={s} style={v(4 + i * 0.6)}>{s}</span>)}</div>
                </div>
              )}
              {key === 'zarf' && (
                <div className="px-float px-toast" style={{ left: 1380, top: 280, transform: `scale(${kart(key)})` }} aria-hidden="true">
                  <p style={v(2)}>Gönderildi</p>
                  <strong style={v(3)}>ik@atlasyazilim.com.tr</strong>
                  <span style={v(4)}>Jr. İş Analisti başvurusu, CV ekli</span>
                </div>
              )}
            </div>
          </div>
        ))}
        <div className="px-scrim" data-hero={cur.hero || undefined} />
        <div className="hz-wrap px-copy">
          {cur.hero ? <Hero /> : (
            <div className="px-caption" key={step}>
              <ol className="sx-rail" aria-hidden="true">{NARRATIVE.map((s, i) => <li key={s.title} data-on={i <= narrIdx || undefined} />)}</ol>
              <p className="sx-step">Adım {narrIdx + 1} / {NARRATIVE.length}</p>
              <h2 className="hz-display sx-title">{cur.title}</h2>
              <p className="hz-lead">{cur.text}</p>
            </div>
          )}
        </div>
      </div>
      <div className="px-static">
        <Hero />
        <ol>
          {NARRATIVE.map((s, i) => (
            <li key={s.title}>
              <img src={srcOf(s.img, false)} alt="" loading="lazy" />
              <div><h2 className="hz-h2">{i + 1}. {s.title}</h2><p className="hz-muted">{s.text}</p></div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
