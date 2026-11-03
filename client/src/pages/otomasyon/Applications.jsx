// Faz 2: onay bekleyen başvurular, gönderilenler, Gmail bağlantısı ve elle tarama.
import React, { useCallback, useEffect, useState } from 'react';
import { listApplications, updateApplication, sendApplication, getGmail, connectGmail, disconnectGmail, runNowStream, listAlerts, updateMe } from '../../lib/automationApi.js';
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
      : r.status === 'ok' ? null
        : r.reason === 'already_ran_today' ? 'Bugünkü tarama zaten yapıldı. Yeni ilanlar yarın sabah gelecek.'
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

  if (err) return <p className="hz-notice" role="alert" style={{ margin: '0 26px 26px' }}>{err}</p>;
  if (!items) return <Spinner />;
  return (
    <>
      {scan && <ScanLive {...scan} />}
      {!items.length && !scan?.running && (
        <div className="hz-empty">
          <p>Onay bekleyen başvuru yok. Asistan her sabah yeni ilanları tarar ve uygun olanlar için ön yazı hazırlar.</p>
          {!scan && <button type="button" className="hz-btn hz-btn-sm" onClick={startScan}>Bugünün taramasını şimdi yap</button>}
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
  if (err) return <p className="hz-notice" role="alert" style={{ margin: '0 26px 26px' }}>{err}</p>;
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
          <SourceLink url={a.source_url} />
        </li>
      ))}
    </ul>
  );
}

// ---- İş alarmlarından gelen ilanlar ------------------------------------------------
const SOURCE = { linkedin: 'LinkedIn', kariyer: 'Kariyer.net', other: 'İş alarmı' };

function CopyAddress({ address }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* elle kopyalanır */ }
  };
  return (
    <div className="hz-alert-address">
      <code>{address}</code>
      <button type="button" className="hz-btn hz-btn-sm" onClick={copy}>{copied ? 'Kopyalandı' : 'Kopyala'}</button>
    </div>
  );
}

function AlertSetup({ address, open }) {
  return (
    <details className="hz-alert-setup" open={open}>
      <summary>LinkedIn ve Kariyer.net alarmlarını nasıl bağlarım?</summary>
      <p className="hz-small">Bu adres sana özel. Alarm e-postalarını buraya yönlendirdiğinde asistan ilanları CV'ne göre puanlar. Bu sitelere otomatik başvuru yapılmaz; uygun ilana sen gidip başvurursun.</p>
      <CopyAddress address={address} />
      <ol className="hz-steps">
        <li>LinkedIn'de (İşler → İş alarmları) ve Kariyer.net'te aradığın pozisyon için e-posta alarmı kur.</li>
        <li>Gmail'de <strong>Ayarlar → Tüm ayarları görüntüle → Yönlendirme ve POP/IMAP → Yönlendirme adresi ekle</strong>'ye yukarıdaki adresi yaz.</li>
        <li>Gmail bu adrese bir onay e-postası gönderir. Onay bağlantısı ve kodu birkaç dakika içinde <strong>Gelen kutusu</strong> sekmesine düşer; bağlantıyı aç.</li>
        <li>Tüm yazılarını değil yalnızca alarmları yönlendirmek için Gmail'de bir filtre oluştur: <em>Kimden</em> alanına <code>jobalerts-noreply@linkedin.com OR kariyer.net</code> yaz, "Filtre oluştur"a bas ve <strong>"Şu adrese yönlendir"</strong> seçeneğinde bu adresi seç. Yönlendirmeyi genel olarak açmana gerek yok.</li>
      </ol>
    </details>
  );
}

export function ListingsView() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { listAlerts().then(setData).catch((e) => setErr(e.message)); }, []);
  if (err) return <p className="hz-notice" role="alert" style={{ margin: '0 26px 26px' }}>{err}</p>;
  if (!data) return <Spinner />;
  if (!data.address) return <div className="hz-empty"><p>LinkedIn ve Kariyer.net alarmlarını bağlama özelliği çok yakında açılacak.</p></div>;
  return (
    <div className="hz-listings">
      <div style={{ padding: '0 26px 18px' }}><AlertSetup address={data.address} open={!data.items.length} /></div>
      {!data.items.length ? (
        <div className="hz-empty"><p>Henüz yönlendirilen ilan yok. Alarm e-postaları gelmeye başlayınca ilanlar puanlarıyla burada görünecek.</p></div>
      ) : (
        <ul className="hz-apps">
          {data.items.map((j) => (
            <li key={j.id} className="hz-app">
              <div className="hz-app-head">
                <h3>{j.title}</h3>
                {j.score != null && <span className="hz-score" title="CV'ne uygunluk puanı">{j.score}</span>}
                <p>{[j.company, j.location, SOURCE[j.source] || j.source, fmt(j.received_at)].filter(Boolean).join(' · ')}</p>
              </div>
              {j.reason && <p className="hz-small">{j.reason}</p>}
              <a className="hz-source" href={j.url} target="_blank" rel="noreferrer noopener">
                <span className="hz-source-label">İlana git</span>
                <span className="hz-source-url">{shortUrl(j.url)}</span>
                <span aria-hidden="true">↗</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
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
          <span>Her gün taramadan sonra onay bekleyen başvuruları ve iş alarmlarından gelen uygun ilanları {email ? <strong>{email}</strong> : 'e-posta adresime'} gönder. Yeni bir şey yoksa e-posta gelmez.</span>
        </label>
        {summaryErr && <p className="hz-notice" role="alert">{summaryErr}</p>}
      </section>
      <section>
        <h3 className="hz-h3">Hedefler ve tercihler</h3>
        <p className="hz-small">CV'lerin, roller, şehirler, günlük limit ve şirket bekleme süresi kurulumda. Asistan her gün {String(scanHour).padStart(2, '0')}:00 civarında yeni ilanları tarar.</p>
        <div><button type="button" className="hz-btn hz-btn-sm" onClick={onEditSetup}>Kurulumu düzenle</button></div>
      </section>
    </div>
  );
}
