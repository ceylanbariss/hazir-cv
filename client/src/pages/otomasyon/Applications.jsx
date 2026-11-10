// Faz 2: onay bekleyen başvurular, gönderilenler, Gmail bağlantısı ve elle tarama.
import React, { useCallback, useEffect, useState } from 'react';
import { listApplications, updateApplication, sendApplication, getGmail, connectGmail, disconnectGmail, runNowStream, listAlerts, removeAlert, checkAlerts, listRuns, updateMe } from '../../lib/automationApi.js';
import { Spinner } from '../../hz/ui.jsx';

const fmt = (iso) => new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const KIND = { job: 'İlan', open_application: 'Açık başvuru' };
/** "https://www.firma.com.tr/kariyer/ilan-1" → "firma.com.tr/kariyer/ilan-1" (kısaltılmış) */
const shortUrl = (url) => {
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname).replace(/\/$/, '');
    const full = u.hostname.replace(/^www\./, '') + path;
    return full.length > 60 ? `${full.slice(0, 57)}…` : full;
  } catch {
    return url;
  }
};

/** İlanın bulunduğu sayfa: her kartta tıklanabilir, belirgin bir bağlantı. */
function SourceLink({ url }) {
  if (!url) return null;
  return (
    <a className="hz-source" href={url} target="_blank" rel="noreferrer noopener" title={url}>
      <span className="hz-source-label">Kaynak</span>
      <span className="hz-source-url">{shortUrl(url)}</span>
      <span aria-hidden="true">↗</span>
    </a>
  );
}

// ---- Çalışma şekli ve şehir ----------------------------------------------------
const MODE = { remote: 'Uzaktan', hybrid: 'Hibrit', onsite: 'Ofiste' };
/** "İstanbul (Hibrit)", "Greater Istanbul (Hybrid)", "Uzaktan" → { mode, city } */
export function parseLocation(text) {
  const t = String(text || '').trim();
  const low = t.toLocaleLowerCase('tr');
  const mode = /uzaktan|remote|evden/.test(low) ? 'remote' : /hibrit|hybrid/.test(low) ? 'hybrid' : /ofis|on-site|onsite|iş yerinde|yerinde/.test(low) ? 'onsite' : null;
  const city = t.replace(/\([^)]*\)/g, '').replace(/\b(greater|metropolitan area)\b/gi, '').replace(/uzaktan|remote|hibrit|hybrid/gi, '').replace(/,?\s*(türkiye|turkey)\s*$/i, '').replace(/[·,\s]+$/g, '').trim();
  return { mode, city: cityName(city) };
}
const CITY_FIX = { istanbul: 'İstanbul', izmir: 'İzmir', eskisehir: 'Eskişehir', ankara: 'Ankara', bursa: 'Bursa', antalya: 'Antalya', kocaeli: 'Kocaeli' };
// LinkedIn çoğu zaman yalnızca ilçeyi yazar: ilçe → "İstanbul · Sarıyer".
const IST_DISTRICTS = ['adalar', 'arnavutköy', 'ataşehir', 'avcılar', 'bağcılar', 'bahçelievler', 'bakırköy', 'başakşehir', 'bayrampaşa', 'beşiktaş', 'beykoz', 'beylikdüzü', 'beyoğlu', 'büyükçekmece', 'çatalca', 'çekmeköy', 'esenler', 'esenyurt', 'eyüpsultan', 'fatih', 'gaziosmanpaşa', 'güngören', 'kadıköy', 'kağıthane', 'kartal', 'küçükçekmece', 'maltepe', 'pendik', 'sancaktepe', 'sarıyer', 'silivri', 'sultanbeyli', 'sultangazi', 'şile', 'şişli', 'tuzla', 'ümraniye', 'üsküdar', 'zeytinburnu'];
function cityName(raw) {
  const c = String(raw || '').split(',')[0].trim();
  if (!c) return null;
  const low = c.toLocaleLowerCase('tr');
  const ascii = low.replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/i̇/g, 'i');
  if (CITY_FIX[ascii]) return CITY_FIX[ascii];
  if (IST_DISTRICTS.includes(low)) return `İstanbul · ${c}`;
  return c;
}
const PinIcon = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg>;
const ModeIcon = ({ mode }) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {mode === 'remote' ? <><path d="M3.5 11 12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /></> : mode === 'onsite' ? <><rect x="4.5" y="3.5" width="15" height="17" rx="1.5" /><path d="M9 8h1.5M13.5 8H15M9 12h1.5M13.5 12H15M10.5 20.5v-4h3v4" /></> : mode === 'hybrid' ? <><path d="M3.5 12 9 7.5l5.5 4.5" /><path d="M5 11v8h8v-8" /><rect x="15" y="6" width="5.5" height="13" rx="1" /></> : <><circle cx="12" cy="12" r="8.5" /><path d="M9.8 9.6a2.3 2.3 0 1 1 3.2 2.1c-.6.3-1 .8-1 1.5v.4M12 16.8h.01" /></>}
  </svg>
);
/** Çalışma şekli ve şehir etiketleri; bilgi yoksa "belirtilmemiş" yazar. */
export function WorkTags({ mode, city }) {
  return (
    <div className="hz-tags">
      <span className="hz-tag" data-mode={mode || 'unknown'}><ModeIcon mode={mode} />{MODE[mode] || 'Çalışma şekli belirtilmemiş'}</span>
      <span className="hz-tag" data-empty={!city || undefined}><PinIcon />{city || 'Şehir belirtilmemiş'}</span>
    </div>
  );
}

const STATUS = { sent: 'Gönderildi', skipped: 'Atlandı', failed: 'Gönderilemedi', replied: 'Dönüş geldi', interview: 'Mülakat', rejected: 'Olumsuz' };

// ---- Gmail -------------------------------------------------------------------
export function useGmail() {
  const [gmail, setGmail] = useState(null);
  const reload = useCallback(() => getGmail().then(setGmail).catch(() => setGmail({ available: false, connected: false })), []);
  useEffect(() => { reload(); }, [reload]);
  return [gmail, reload];
}

export async function startGmailConnect() {
  const { url } = await connectGmail();
  window.location.assign(url);
}

/** Message for the ?gmail=… parameter Google's redirect brings back. */
export function gmailReturnMessage(code) {
  return {
    ok: ['ok', 'Gmail bağlandı. Onayladığın başvurular artık kendi adresinden gönderilecek.'],
    denied: ['err', 'Gmail izni verilmedi. İstediğin zaman Ayarlar sekmesinden tekrar bağlayabilirsin.'],
    scope: ['err', 'E-posta gönderme izni işaretlenmemiş. Bağlarken "e-posta gönderme" kutusunu işaretleyip tekrar dene.'],
    expired: ['err', 'Bağlantı süresi doldu. Lütfen tekrar dene.'],
    unavailable: ['err', 'Gmail bağlantısı bu sunucuda henüz açılmadı.'],
    error: ['err', 'Gmail bağlanamadı. Lütfen tekrar dene.'],
  }[code] || null;
}

// ---- Canlı tarama ----------------------------------------------------------------
const STEP_ICON = { start: '•', search: '⌕', read: '▤', evaluate: '◎', draft: '✓', skip: '–', done: '✓' };

function ScanLive({ events, pct, running, final }) {
  const list = React.useRef(null);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [events.length]);
  const last = events[events.length - 1];
  const s = last?.stats || {};
  return (
    <div className="hz-scan" aria-live="polite">
      <div className="hz-scan-head">
        <strong>{running ? 'Asistan çalışıyor' : 'Tarama bitti'}</strong>
        <span className="hz-meta">{pct}%</span>
      </div>
      <div className="hz-bar-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="hz-bar-fill" style={{ width: `${pct}%` }} data-running={running || undefined} />
      </div>
      <dl className="hz-scan-stats">
        <div><dt>Arama</dt><dd>{s.searches ?? 0}</dd></div>
        <div><dt>Sayfa</dt><dd>{s.hits ?? 0}</dd></div>
        <div><dt>Değerlendirilen</dt><dd>{s.evaluated ?? 0}</dd></div>
        <div><dt>Hazırlanan</dt><dd>{s.drafted ?? 0}</dd></div>
      </dl>
      <ol className="hz-scan-log" ref={list}>
        {events.map((e, i) => {
          const current = running && i === events.length - 1;
          return (
            <li key={i} data-step={e.step} data-current={current || undefined}>
              <span className="hz-scan-icon" aria-hidden="true">{current ? <span className="hz-spin" /> : STEP_ICON[e.step] || '•'}</span>
              <span>{e.message}</span>
            </li>
          );
        })}
      </ol>
      {final && <p className="hz-small" role="status">{final}</p>}
    </div>
  );
}

const resultMessage = (r) =>
  !r ? 'Tarama tamamlanamadı. Daha sonra tekrar dene.'
    : r.type === 'error' ? r.message
      : r.status === 'ok' ? (r.runsToday ? `Bugün ${r.runsToday}/${r.maxRuns || 3} tarama yapıldı.` : null)
        : r.reason === 'daily_runs_used' || r.reason === 'already_ran_today' ? `Bugünkü ${r.maxRuns || 3} taramanın hepsi yapıldı. Yeni taramalar yarın açılacak.`
          : r.reason === 'already_running' ? 'Tarama şu an başka bir pencerede çalışıyor. Birkaç dakika sonra sayfayı yenile.'
            : r.reason === 'incomplete_setup' || r.reason === 'not_ready' ? 'Önce kurulumu tamamla.'
              : 'Tarama tamamlanamadı. Daha sonra tekrar dene.';

// ---- Onay bekleyenler -----------------------------------------------------------
function PendingItem({ app, gmailConnected, onChange, onConnect }) {
  const [edit, setEdit] = useState(false);
  const [subject, setSubject] = useState(app.subject || '');
  const [letter, setLetter] = useState(app.cover_letter || '');
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(app.error || null);

  const act = (name, fn) => async () => {
    setBusy(name); setErr(null);
    try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };
  const save = act('save', async () => {
    const { application } = await updateApplication(app.id, { subject: subject.trim(), cover_letter: letter.trim() });
    onChange(application, 'update');
    setEdit(false);
  });
  const skip = act('skip', async () => {
    const { application } = await updateApplication(app.id, { status: 'skipped' });
    onChange(application, 'remove');
  });
  const send = act('send', async () => {
    if (edit) await updateApplication(app.id, { subject: subject.trim(), cover_letter: letter.trim() });
    const { application } = await sendApplication(app.id);
    onChange(application, 'remove');
  });

  return (
    <li className="hz-app">
      <div className="hz-app-head">
        <h3>{app.company}{app.position ? ` · ${app.position}` : ''}</h3>
        <span className="hz-score" data-kind={app.kind} title="Uygunluk puanı">{app.score ?? '–'}</span>
        <p>
          {KIND[app.kind] || 'Başvuru'} · {app.recipient}
          {app.cv_label && <> · CV: {app.cv_label}</>}
        </p>
      </div>
      <WorkTags mode={app.work_mode} city={app.city} />
      <SourceLink url={app.source_url} />
      {app.reason && <p className="hz-reason">{app.reason}</p>}
      {edit ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <label className="hz-field"><span className="hz-label">Konu</span><input className="hz-input" value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} /></label>
          <label className="hz-field"><span className="hz-label">Ön yazı</span><textarea className="hz-textarea" value={letter} maxLength={3000} onChange={(e) => setLetter(e.target.value)} /></label>
        </div>
      ) : (
        <>
          <p className="hz-meta">Konu: {app.subject}</p>
          <div className="hz-letter-text">{app.cover_letter}</div>
        </>
      )}
      {err && <p className="hz-notice" role="alert">{err}</p>}
      <div className="hz-actions">
        {gmailConnected ? (
          <button type="button" className="hz-btn hz-btn-posta hz-btn-sm" disabled={!!busy} onClick={send}>{busy === 'send' ? <><span className="hz-spin" />Gönderiliyor</> : 'Onayla ve gönder'}</button>
        ) : (
          <button type="button" className="hz-btn hz-btn-posta hz-btn-sm" onClick={onConnect}>Göndermek için Gmail'i bağla</button>
        )}
        {edit ? (
          <button type="button" className="hz-btn hz-btn-sm" disabled={!!busy} onClick={save}>{busy === 'save' ? 'Kaydediliyor' : 'Kaydet'}</button>
        ) : (
          <button type="button" className="hz-btn hz-btn-sm" disabled={!!busy} onClick={() => setEdit(true)}>Düzenle</button>
        )}
        <button type="button" className="hz-link" disabled={!!busy} onClick={skip}>Atla</button>
        <span className="hz-meta">{fmt(app.created_at)}</span>
      </div>
    </li>
  );
}

export function PendingView({ gmail, onConnect, onCountChange }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  const [scan, setScan] = useState(null); // { running, events, pct, final }

  const load = useCallback(() => listApplications('pending_approval,failed').then(({ items }) => { setItems(items); onCountChange?.(items.length); }).catch((e) => setErr(e.message)), [onCountChange]);
  useEffect(() => { load(); }, [load]);

  const onChange = (app, how) => {
    setItems((list) => {
      const next = how === 'remove' ? list.filter((a) => a.id !== app.id) : list.map((a) => (a.id === app.id ? { ...a, ...app } : a));
      onCountChange?.(next.length);
      return next;
    });
  };

  const startScan = async () => {
    setScan({ running: true, events: [{ step: 'start', message: 'Taramayı başlatıyorum…', stats: {} }], pct: 1, final: null });
    try {
      const last = await runNowStream((ev) => {
        if (ev.type !== 'progress') return;
        setScan((s) => ({ ...s, events: [...s.events, ev].slice(-60), pct: Math.max(s.pct, Math.min(100, ev.pct || 0)) }));
      });
      setScan((s) => ({ ...s, running: false, pct: last?.type === 'result' && last.status === 'ok' ? 100 : s.pct, final: resultMessage(last) }));
      load();
    } catch (e) {
      setScan((s) => ({ ...s, running: false, final: e.message }));
    }
  };

  if (err) return <p className="hz-notice" role="alert" style={{ margin: '0 var(--pad-x) 26px' }}>{err}</p>;
  if (!items) return <Spinner />;
  return (
    <>
      {scan && <ScanLive {...scan} />}
      {!items.length && !scan?.running && (
        <div className="hz-empty">
          <p>Onay bekleyen başvuru yok. Asistan her sabah yeni ilanları tarar ve uygun olanlar için ön yazı hazırlar.</p>
        </div>
      )}
      {!scan?.running && (
        <div style={{ padding: '0 var(--pad-x) 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="hz-btn hz-btn-sm" onClick={startScan}>Şimdi tara</button>
          <span className="hz-small">Günde en fazla 3 tarama yapılabilir; her tarama farklı aramalarla yeni ilanlara bakar.</span>
        </div>
      )}
      {items.length > 0 && (
        <ul className="hz-apps">
          {items.map((a) => <PendingItem key={a.id} app={a} gmailConnected={gmail?.connected} onChange={onChange} onConnect={onConnect} />)}
        </ul>
      )}
    </>
  );
}

// ---- Başvurular ------------------------------------------------------------------
export function SentView() {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { listApplications('sent,skipped,replied,interview,rejected').then(({ items }) => setItems(items)).catch((e) => setErr(e.message)); }, []);
  if (err) return <p className="hz-notice" role="alert" style={{ margin: '0 var(--pad-x) 26px' }}>{err}</p>;
  if (!items) return <Spinner />;
  if (!items.length) return <div className="hz-empty"><p>Henüz gönderilmiş başvuru yok. Onayladığın başvurular burada listelenecek.</p></div>;
  return (
    <ul className="hz-apps">
      {items.map((a) => (
        <li key={a.id} className="hz-app">
          <div className="hz-app-head">
            <h3>{a.company}{a.position ? ` · ${a.position}` : ''}</h3>
            <span className="hz-meta">{STATUS[a.status] || a.status}</span>
            <p>{a.recipient} · {fmt(a.sent_at || a.created_at)}</p>
          </div>
          <WorkTags mode={a.work_mode} city={a.city} />
          <SourceLink url={a.source_url} />
        </li>
      ))}
    </ul>
  );
}

// ---- İş alarmlarından gelen ilanlar ------------------------------------------------
const SOURCE = { linkedin: 'LinkedIn', kariyer: 'Kariyer.net', other: 'İş alarmı' };
const GMAIL_FORWARDING = 'https://mail.google.com/mail/u/0/#settings/fwdandpop';
// Gmail'in "filtre oluştur" penceresini LinkedIn ve Kariyer.net göndericileri dolu olarak açar.
const GMAIL_FILTER = 'https://mail.google.com/mail/u/0/#create-filter/from=jobalerts-noreply%40linkedin.com+OR+jobs-noreply%40linkedin.com+OR+kariyer.net';
const TR_ASCII = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u' };
const slug = (s) => s.toLocaleLowerCase('tr').replace(/[çğıiöşü]/g, (c) => TR_ASCII[c]).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const linkedinSearch = (role, city) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(role)}&location=${encodeURIComponent(city || 'Türkiye')}`;
const kariyerSearch = (role) => `https://www.kariyer.net/is-ilanlari/${slug(role)}`;
const ago = (iso) => {
  if (!iso) return '';
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600000);
  return h < 1 ? 'az önce' : h < 24 ? `${h} saat önce` : `${Math.round(h / 24)} gün önce`;
};

function CopyAddress({ address }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* elle kopyalanır */ }
  };
  return (
    <div className="hz-alert-address">
      <code>{address}</code>
      <button type="button" className="hz-btn hz-btn-sm" onClick={copy}>{copied ? 'Kopyalandı ✓' : 'Kopyala'}</button>
    </div>
  );
}

function GuideStep({ n, done, title, children }) {
  return (
    <li className="hz-guide-step" data-done={done || undefined}>
      <span className="hz-guide-dot" aria-hidden="true">{done ? '✓' : n}</span>
      <div className="hz-guide-body">
        <h4>{title}{done && <span className="hz-sr"> (tamamlandı)</span>}</h4>
        {children}
      </div>
    </li>
  );
}

/** LinkedIn ve Kariyer.net alarmlarını bağlama rehberi: her adım tek dokunuşla doğru sayfayı açar. */
function AlertGuide({ address, setup = {} }) {
  const connected = !!setup.lastAlertAt;
  const [open, setOpen] = useState(!connected);
  const roles = setup.roles?.length ? setup.roles : ['İş Analisti'];
  const city = setup.cities?.[0];
  const doneCount = [connected, !!setup.confirmAt || connected, connected].filter(Boolean).length;
  return (
    <section className="hz-guide" data-open={open || undefined}>
      <button type="button" className="hz-guide-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="hz-guide-badge" data-on={connected || undefined}>{connected ? 'Bağlı' : `${doneCount}/3`}</span>
        <span className="hz-guide-title">
          <strong>{connected ? 'LinkedIn ve Kariyer.net alarmları bağlı' : 'LinkedIn ve Kariyer.net alarmlarını bağla'}</strong>
          <small>{connected ? `Son alarm ${ago(setup.lastAlertAt)} geldi` : 'Üç adım, yaklaşık iki dakika'}</small>
        </span>
        <span className="hz-guide-chev" aria-hidden="true" />
      </button>
      {open && (
        <div className="hz-guide-content">
          <p className="hz-small">Alarm e-postaların sana özel adrese gelir, asistan ilanları CV'ne göre puanlar ve kapanan ilanları ayıklar. Bu sitelere otomatik başvuru yapılmaz; uygun ilana sen başvurursun.</p>
          <p className="hz-guide-mobile">Gmail ayarları telefon uygulamasında yok. 2. ve 3. adımı bilgisayardan ya da telefonun tarayıcısından yap.</p>
          <ol className="hz-guide-steps">
            <GuideStep n={1} done={connected} title="Alarm kur">
              <p>Aşağıdan rolünü seç. LinkedIn'de arama sonuçlarının üstündeki <b>İş alarmı</b> anahtarını aç; Kariyer.net'te <b>Aramayı kaydet</b> deyip e-posta bildirimini seç.</p>
              <div className="hz-guide-links">
                {roles.map((r) => (
                  <React.Fragment key={r}>
                    <a className="hz-pill" href={linkedinSearch(r, city)} target="_blank" rel="noreferrer noopener"><span className="hz-pill-src">LinkedIn</span>{r}</a>
                    <a className="hz-pill" href={kariyerSearch(r)} target="_blank" rel="noreferrer noopener"><span className="hz-pill-src">Kariyer.net</span>{r}</a>
                  </React.Fragment>
                ))}
              </div>
            </GuideStep>
            <GuideStep n={2} done={!!setup.confirmAt || connected} title="Adresini Gmail'e ekle">
              <CopyAddress address={address} />
              <p>Gmail'de <b>Yönlendirme adresi ekle</b>'ye bas, adresi yapıştır, <b>İleri → Devam</b> de. "Tüm postaları yönlendir"i seçmene gerek yok.</p>
              <div className="hz-guide-links">
                <a className="hz-btn hz-btn-sm" href={GMAIL_FORWARDING} target="_blank" rel="noreferrer noopener">Gmail yönlendirme ayarını aç ↗</a>
                {setup.confirmUrl && !connected && <a className="hz-btn hz-btn-posta hz-btn-sm" href={setup.confirmUrl} target="_blank" rel="noreferrer noopener">Gmail onayını ver ↗</a>}
              </div>
              {setup.confirmAt && !connected && <p className="hz-small">Gmail'in onay e-postası bize ulaştı. Yukarıdaki <b>Gmail onayını ver</b> düğmesine basıp <b>Onayla</b> de.</p>}
            </GuideStep>
            <GuideStep n={3} done={connected} title="Yalnızca alarmları yönlendir">
              <p>Bu düğme Gmail'de filtreyi LinkedIn ve Kariyer.net için doldurulmuş açar. <b>Filtre oluştur</b> → <b>Şu adrese yönlendir</b>'i işaretle, adresini seç → <b>Filtre oluştur</b>.</p>
              <div className="hz-guide-links">
                <a className="hz-btn hz-btn-posta hz-btn-sm" href={GMAIL_FILTER} target="_blank" rel="noreferrer noopener">Filtreyi hazır aç ↗</a>
              </div>
              {!connected && <p className="hz-small">İlk alarm e-postası geldiğinde bu adımlar kendiliğinden işaretlenir.</p>}
            </GuideStep>
          </ol>
        </div>
      )}
    </section>
  );
}

function ListingStatus({ job }) {
  if (job.status === 'closed') return <span className="hz-state" data-state="closed" title={job.closed_reason || ''}>Başvuruya kapandı</span>;
  if (job.status === 'open') return <span className="hz-state" data-state="open">Başvuru alıyor</span>;
  return null;
}

export function ListingsView() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [checking, setChecking] = useState(false);
  const [show, setShow] = useState('open');
  useEffect(() => {
    let alive = true;
    listAlerts()
      .then((d) => {
        if (!alive) return;
        setData(d);
        if (!d.items?.length) return;
        // Kapanan ilanları arka planda kontrol et; liste o sırada kullanılabilir.
        setChecking(true);
        checkAlerts()
          .then((r) => { if (alive && r.items) setData((cur) => ({ ...cur, items: r.items })); })
          .catch(() => {})
          .finally(() => alive && setChecking(false));
      })
      .catch((e) => setErr(e.message));
    return () => { alive = false; };
  }, []);
  const hide = async (id) => {
    try { await removeAlert(id); setData((d) => ({ ...d, items: d.items.filter((j) => j.id !== id) })); } catch (e) { setErr(e.message); }
  };
  if (err) return <p className="hz-notice" role="alert" style={{ margin: '0 var(--pad-x) 26px' }}>{err}</p>;
  if (!data) return <Spinner />;
  if (!data.address) return <div className="hz-empty"><p>LinkedIn ve Kariyer.net alarmlarını bağlama özelliği çok yakında açılacak.</p></div>;
  const closed = data.items.filter((j) => j.status === 'closed');
  const active = data.items.filter((j) => j.status !== 'closed');
  const list = show === 'closed' ? closed : active;
  return (
    <div className="hz-listings">
      <div className="hz-pad-x"><AlertGuide address={data.address} setup={data.setup} /></div>
      {data.items.length > 0 && (
        <div className="hz-filter hz-pad-x" role="tablist" aria-label="İlan durumu">
          <button type="button" role="tab" aria-selected={show === 'open'} onClick={() => setShow('open')}>Açık <b>{active.length}</b></button>
          <button type="button" role="tab" aria-selected={show === 'closed'} onClick={() => setShow('closed')}>Kapanan <b>{closed.length}</b></button>
          {checking && <span className="hz-meta hz-checking"><span className="hz-spin" />Kapanan ilanlar kontrol ediliyor</span>}
        </div>
      )}
      {!data.items.length ? (
        <div className="hz-empty"><p>Henüz yönlendirilen ilan yok. Alarm e-postaları gelmeye başlayınca ilanlar puanlarıyla burada görünecek.</p></div>
      ) : !list.length ? (
        <div className="hz-empty"><p>{show === 'closed' ? 'Başvuruya kapanmış ilan yok.' : 'Açık ilan kalmadı. Yeni alarmlar geldikçe burada görünecek.'}</p></div>
      ) : (
        <ul className="hz-apps">
          {list.map((j) => (
            <li key={j.id} className="hz-app" data-closed={j.status === 'closed' || undefined}>
              <div className="hz-app-head">
                <h3>{j.title}</h3>
                {j.score != null && <span className="hz-score" title="CV'ne uygunluk puanı">{j.score}</span>}
                <p>{[j.company, SOURCE[j.source] || j.source, fmt(j.received_at)].filter(Boolean).join(' · ')}</p>
              </div>
              <WorkTags {...parseLocation(j.location)} />
              <ListingStatus job={j} />
              {j.reason && <p className="hz-small">{j.reason}</p>}
              <div className="hz-app-foot">
                <a className="hz-source" href={j.url} target="_blank" rel="noreferrer noopener">
                  <span className="hz-source-label">{j.status === 'closed' ? 'İlanı gör' : 'İlana git'}</span>
                  <span className="hz-source-url">{shortUrl(j.url)}</span>
                  <span aria-hidden="true">↗</span>
                </a>
                <button type="button" className="hz-link" onClick={() => hide(j.id)}>Kaldır</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Tarama geçmişi --------------------------------------------------------------
const hh = (h) => `${String(h).padStart(2, '0')}:00`;
const when = (iso) => new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
const TRIGGER = { auto: 'Otomatik', manual: 'Elle' };

function RunHistory({ scanHour }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { listRuns().then(setData).catch((e) => setErr(e.message)); }, []);
  const hours = data?.autoHours || [scanHour];
  return (
    <section>
      <h3 className="hz-h3">Taramalar</h3>
      <p className="hz-small">Asistan her gün {hours.map(hh).join(', ')} civarında kendiliğinden tarar. Elle başlattığın taramalar da günlük {data?.maxRuns || 3} taramaya sayılır.</p>
      {err && <p className="hz-notice" role="alert">{err}</p>}
      {!data && !err && <Spinner />}
      {data && (data.items.length ? (
        <ul className="hz-runs">
          {data.items.map((r) => (
            <li key={r.id}>
              <span>{when(r.started_at)}</span>
              <span className="hz-status" data-on={r.trigger === 'auto' || undefined}>{TRIGGER[r.trigger] || 'Tarama'}</span>
              <span className="hz-small">{!r.finished_at ? 'sürüyor ya da yarıda kaldı' : `${r.searches} arama · ${r.drafted} başvuru hazırlandı`}{r.error ? ' · hata' : ''}</span>
            </li>
          ))}
        </ul>
      ) : <p className="hz-small">Henüz tarama yapılmadı.</p>)}
    </section>
  );
}

// ---- Ayarlar ------------------------------------------------------------------
export function SettingsView({ gmail, reloadGmail, onConnect, onEditSetup, scanHour = 9, dailySummary = true, email }) {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(dailySummary !== false);
  const [summaryErr, setSummaryErr] = useState(null);
  const toggleSummary = async (on) => {
    setSummary(on); setSummaryErr(null);
    try { await updateMe({ daily_summary: on }); } catch (e) { setSummary(!on); setSummaryErr(e.message); }
  };
  const [err, setErr] = useState(null);
  const disconnect = async () => {
    setBusy(true); setErr(null);
    try { await disconnectGmail(); await reloadGmail(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="hz-settings">
      <section>
        <h3 className="hz-h3">Gmail bağlantısı</h3>
        {!gmail ? <Spinner /> : gmail.connected ? (
          <>
            <span className="hz-status" data-on>{gmail.email} bağlı</span>
            <p className="hz-small">Asistan yalnızca senin onayladığın başvuruları bu adresten gönderir. Gelen kutun okunmaz.</p>
            <div><button type="button" className="hz-btn hz-btn-sm" disabled={busy} onClick={disconnect}>{busy ? 'Kaldırılıyor' : 'Bağlantıyı kaldır'}</button></div>
          </>
        ) : (
          <>
            <span className="hz-status">Bağlı değil</span>
            <p className="hz-small">Başvuruların kendi Gmail adresinden gitmesi için yalnızca "e-posta gönderme" izni istenir. Google, uygulama doğrulama sürecinde olduğu için bir uyarı gösterebilir: "Gelişmiş → Devam et" diyerek ilerleyebilirsin.</p>
            {gmail.available ? (
              <div><button type="button" className="hz-btn hz-btn-posta hz-btn-sm" onClick={onConnect}>Gmail'i bağla</button></div>
            ) : (
              <p className="hz-small">Gmail bağlantısı çok yakında açılacak.</p>
            )}
          </>
        )}
        {err && <p className="hz-notice" role="alert">{err}</p>}
      </section>
      <section>
        <h3 className="hz-h3">Günlük özet e-postası</h3>
        <label className="hz-check">
          <input type="checkbox" checked={summary} onChange={(e) => toggleSummary(e.target.checked)} />
          <span>Her gün ilk taramadan sonra onay bekleyen başvuruları ve iş alarmlarından gelen ilanları {email ? <strong>{email}</strong> : 'e-posta adresime'} gönder. Günün sonraki taramalarında yalnızca yeni bir şey çıkarsa tekrar gelir.</span>
        </label>
        {summaryErr && <p className="hz-notice" role="alert">{summaryErr}</p>}
      </section>
      <RunHistory scanHour={scanHour} />
      <section>
        <h3 className="hz-h3">Hedefler ve tercihler</h3>
        <p className="hz-small">CV'lerin, roller, şehirler, günlük limit, tarama saati ve şirket bekleme süresi kurulumda.</p>
        <div><button type="button" className="hz-btn hz-btn-sm" onClick={onEditSetup}>Kurulumu düzenle</button></div>
      </section>
    </div>
  );
}
