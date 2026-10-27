// Faz 2: onay bekleyen başvurular, gönderilenler, Gmail bağlantısı ve elle tarama.
import React, { useCallback, useEffect, useState } from 'react';
import { listApplications, updateApplication, sendApplication, getGmail, connectGmail, disconnectGmail, runNowStream } from '../../lib/automationApi.js';
import { Spinner } from '../../hz/ui.jsx';

const fmt = (iso) => new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const KIND = { job: 'İlan', open_application: 'Açık başvuru' };
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
          {app.source_url && <> · <a href={app.source_url} target="_blank" rel="noreferrer noopener">Sayfayı aç</a></>}
          {app.cv_label && <> · CV: {app.cv_label}</>}
        </p>
      </div>
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
            <p>{a.recipient} · {fmt(a.sent_at || a.created_at)}{a.source_url && <> · <a href={a.source_url} target="_blank" rel="noreferrer noopener">Sayfa</a></>}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---- Ayarlar ------------------------------------------------------------------
export function SettingsView({ gmail, reloadGmail, onConnect, onEditSetup }) {
  const [busy, setBusy] = useState(false);
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
        <h3 className="hz-h3">Hedefler ve tercihler</h3>
        <p className="hz-small">CV'lerin, roller, şehirler, günlük limit ve şirket bekleme süresi kurulumda. Asistan her sabah 09:00 civarında çalışır.</p>
        <div><button type="button" className="hz-btn hz-btn-sm" onClick={onEditSetup}>Kurulumu düzenle</button></div>
      </section>
    </div>
  );
}
