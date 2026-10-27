// Faz 2: onay bekleyen başvurular, gönderilenler, Gmail bağlantısı ve elle tarama.
import React, { useCallback, useEffect, useState } from 'react';
import { listApplications, updateApplication, sendApplication, getGmail, connectGmail, disconnectGmail, runNow } from '../../lib/automationApi.js';
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
  const [run, setRun] = useState({ busy: false, msg: null });

  const load = useCallback(() => listApplications('pending_approval,failed').then(({ items }) => { setItems(items); onCountChange?.(items.length); }).catch((e) => setErr(e.message)), [onCountChange]);
  useEffect(() => { load(); }, [load]);

  const onChange = (app, how) => {
    setItems((list) => {
      const next = how === 'remove' ? list.filter((a) => a.id !== app.id) : list.map((a) => (a.id === app.id ? { ...a, ...app } : a));
      onCountChange?.(next.length);
      return next;
    });
  };

  const scan = async () => {
    setRun({ busy: true, msg: null });
    try {
      const r = await runNow();
      const msg =
        r.status === 'ok' ? (r.drafted ? `${r.drafted} yeni başvuru hazırlandı.` : 'Tarama bitti; bugün uygun yeni ilan bulunamadı. Yarın tekrar denenecek.')
          : r.reason === 'already_ran_today' ? 'Bugünkü tarama zaten yapıldı. Yeni ilanlar yarın gelecek.'
            : r.reason === 'already_running' ? 'Tarama şu an çalışıyor, birkaç dakika sonra sayfayı yenile.'
              : r.reason === 'incomplete_setup' || r.reason === 'not_ready' ? 'Önce kurulumu tamamla.'
                : 'Tarama tamamlanamadı. Daha sonra tekrar dene.';
      setRun({ busy: false, msg });
      load();
    } catch (e) {
      setRun({ busy: false, msg: e.message });
    }
  };

  if (err) return <p className="hz-notice" role="alert" style={{ margin: '0 26px 26px' }}>{err}</p>;
  if (!items) return <Spinner />;
  return (
    <>
      {!items.length && (
        <div className="hz-empty">
          <p>Onay bekleyen başvuru yok. Asistan her sabah yeni ilanları tarar ve uygun olanlar için ön yazı hazırlar.</p>
          <button type="button" className="hz-btn hz-btn-sm" disabled={run.busy} onClick={scan}>{run.busy ? <><span className="hz-spin" />Taranıyor (1–3 dk)</> : 'Bugünün taramasını şimdi yap'}</button>
          {run.msg && <p className="hz-small" role="status">{run.msg}</p>}
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
