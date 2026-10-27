// Başvuru asistanı: giriş → onay → panel / kurulum sihirbazı.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { authConfigured, signInWithGoogle, signInWithIdToken, completeRedirect, getSession, onAuthChange, signOut } from '../../lib/auth.js';
import { googleConfigured, renderGoogleButton } from '../../lib/google.js';
import { getMe, updateMe, getInbox, markInboxRead } from '../../lib/automationApi.js';
import { navigate } from '../../router.js';
import { Shell, TopBar, Footer, Spinner } from '../../hz/ui.jsx';
import Wizard from './Wizard.jsx';
import { PendingView, SentView, SettingsView, useGmail, startGmailConnect, gmailReturnMessage } from './Applications.jsx';

const go = (path) => (e) => { e.preventDefault(); navigate(path); };

// ---- Giriş ------------------------------------------------------------------
export function SignIn({ error }) {
  const btn = useRef(null);
  const [err, setErr] = useState(error || null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!googleConfigured || !btn.current) return;
    const width = Math.min(340, btn.current.offsetWidth || 340);
    renderGoogleButton(btn.current, async (cred) => {
      setErr(null); setBusy(true);
      try { await signInWithIdToken(cred); } catch (e) { setErr(e.message); setBusy(false); }
    }, { width }).catch((e) => setErr(e.message));
  }, []);

  return (
    <Shell>
      <TopBar><button type="button" className="hz-link" onClick={() => navigate('/')}>Ana sayfa</button></TopBar>
      <main className="hz-wrap hz-auth">
        <section>
          <h1 className="hz-display" style={{ fontSize: 'clamp(36px, 5vw, 54px)', maxWidth: '14ch' }}>Başvuru asistanını kur</h1>
          <ol className="hz-steps">
            <li><div><strong>Google ile giriş yap</strong><p>Hesabın oluşur. Adın ve e-posta adresin dışında bir bilgi alınmaz.</p></div></li>
            <li><div><strong>CV'lerini ve hedeflerini gir</strong><p>Roller, şehirler ve çalışma şekli. Yaklaşık beş dakika sürer.</p></div></li>
            <li><div><strong>Her gün başvurular hazır olsun</strong><p>Asistan uygun ilanları bulur ve ön yazıları hazırlar. Sen onaylarsın, başvuru Gmail'inden gider.</p></div></li>
          </ol>
        </section>
        <section className="hz-sheet hz-pad" style={{ display: 'grid', gap: 18 }}>
          <h2 className="hz-h2">Giriş yap</h2>
          <p className="hz-small">Gmail'inden e-posta gönderme izni şimdi istenmez; kurulumun sonunda ayrıca sorulur.</p>
          {googleConfigured ? (
            <div ref={btn} className="hz-gbtn" style={{ opacity: busy ? 0.5 : 1 }} />
          ) : (
            <button type="button" className="hz-btn hz-btn-murekkep" onClick={() => signInWithGoogle().catch((e) => setErr(e.message))}>Google ile devam et</button>
          )}
          {busy && <p className="hz-small" role="status">Giriş yapılıyor…</p>}
          {err && <p className="hz-notice" role="alert">{err}</p>}
          <p className="hz-small">Devam ederek <a href="/kosullar" onClick={go('/kosullar')}>kullanım koşullarını</a> kabul etmiş olursun. Verilerini nasıl işlediğimiz <a href="/gizlilik" onClick={go('/gizlilik')}>gizlilik politikasında</a> yazıyor.</p>
        </section>
      </main>
      <Footer />
    </Shell>
  );
}

// ---- Açık rıza ---------------------------------------------------------------
export function Consent({ onAccept, email, onSignOut }) {
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  return (
    <Shell>
      <TopBar><span className="hz-small hz-ui">{email}</span><button type="button" className="hz-link" onClick={onSignOut}>Çıkış yap</button></TopBar>
      <main className="hz-narrow" style={{ padding: '24px 0 64px' }}>
        <section className="hz-sheet hz-pad" style={{ display: 'grid', gap: 18 }}>
          <h1 className="hz-h1">Başlamadan önce</h1>
          <p>Asistanın çalışabilmesi için CV'lerin, hedeflerin ve başvuru kayıtların hesabında saklanır. Bunlar yalnızca senin için ilan bulmak, ön yazı hazırlamak ve başvuru göndermek için kullanılır. Verilerin Avrupa Birliği'ndeki sunucularda tutulur ve yapay zeka hizmetiyle (Google Gemini) işlenir.</p>
          <p>İstediğin an otomasyonu durdurabilir, Gmail bağlantısını kaldırabilir ve hesabını tüm verileriyle silebilirsin.</p>
          <label className="hz-check">
            <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
            <span><a href="/gizlilik" onClick={go('/gizlilik')}>Gizlilik politikasını</a> okudum; verilerimin bu amaçla işlenmesine ve yurt dışındaki hizmet sağlayıcılara aktarılmasına açık rıza veriyorum.</span>
          </label>
          {err && <p className="hz-notice" role="alert">{err}</p>}
          <div>
            <button type="button" className="hz-btn hz-btn-posta" disabled={!ok || busy} onClick={async () => { setBusy(true); setErr(null); try { await onAccept(); } catch (e) { setErr(e.message); setBusy(false); } }}>
              {busy ? <><span className="hz-spin" />Kaydediliyor</> : 'Onayla ve devam et'}
            </button>
          </div>
        </section>
      </main>
    </Shell>
  );
}

// ---- Panel ------------------------------------------------------------------
const TABS = [
  ['inbox', 'Gelen kutusu'],
  ['today', 'Onay bekleyenler'],
  ['applications', 'Başvurular'],
  ['listings', 'İlanlar'],
  ['settings', 'Ayarlar'],
];

const fmt = (iso) => new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

export function InboxList({ items }) {
  if (!items.length) return <div className="hz-empty"><p>Henüz bir şey yok. Kurulumu tamamladığında günlük özetler buraya gelecek.</p></div>;
  return (
    <ul className="hz-letters">
      {items.map((i) => (
        <li key={i.id} className="hz-letter" data-unread={!i.read_at || undefined}>
          <h3>{i.title}</h3>
          <time dateTime={i.created_at}>{fmt(i.created_at)}</time>
          {i.body && <p>{i.body}</p>}
        </li>
      ))}
    </ul>
  );
}

function InboxView({ onRead }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    getInbox()
      .then(async ({ items }) => {
        setItems(items);
        if (items.some((i) => !i.read_at)) { await markInboxRead(); onRead(); }
      })
      .catch((e) => setErr(e.message));
  }, [onRead]);
  if (err) return <p className="hz-notice" role="alert">{err}</p>;
  if (!items) return <Spinner />;
  return <InboxList items={items} />;
}

const Later = ({ text }) => <div className="hz-empty"><p>{text}</p></div>;

function SetupCallout({ profile, onStart, gmail, onConnect }) {
  const first = profile.full_name?.split(' ')[0];
  if (profile.setup_step >= 6) {
    if (gmail?.connected) return null;
    if (gmail?.available) {
      return (
        <div className="hz-callout">
          <div>
            <h2 className="hz-h2">Son adım: Gmail'ini bağla</h2>
            <p>Asistan her sabah uygun ilanları bulup ön yazıları hazırlar. Onayladığın başvurular kendi Gmail adresinden, CV'n ekli olarak gider. Yalnızca e-posta gönderme izni istenir; gelen kutun okunmaz.</p>
          </div>
          <button type="button" className="hz-btn hz-btn-posta" onClick={onConnect}>Gmail'i bağla</button>
        </div>
      );
    }
    return (
      <div className="hz-callout">
        <div>
          <h2 className="hz-h2">Kurulum kaydedildi</h2>
          <p>Son adım Gmail bağlantısı. Bu özellik çok yakında açılacak; açıldığında gelen kutuna haber vereceğiz. Bu sırada ayarlarını istediğin gibi değiştirebilirsin.</p>
        </div>
        <button type="button" className="hz-btn hz-btn-posta" onClick={onStart}>Kurulumu düzenle</button>
      </div>
    );
  }
  const started = profile.setup_step > 1;
  return (
    <div className="hz-callout">
      <div>
        <h2 className="hz-h2">{started ? 'Kuruluma kaldığın yerden devam et' : `${first ? first + ', a' : 'A'}sistanını kuralım`}</h2>
        <p>CV'lerini yükle, rollerini ve şehirlerini seç. Yaklaşık beş dakika sürer.</p>
      </div>
      <button type="button" className="hz-btn hz-btn-posta" onClick={onStart}>{started ? 'Devam et' : 'Kuruluma başla'}</button>
    </div>
  );
}

export function Panel({ profile, unread, setUnread, onSignOut, onStartSetup, inbox, notice }) {
  const [tab, setTab] = useState(notice ? 'settings' : 'inbox');
  const onRead = useCallback(() => setUnread(0), [setUnread]);
  const [gmail, reloadGmail] = useGmail();
  const [connectErr, setConnectErr] = useState(null);
  const onConnect = useCallback(() => { setConnectErr(null); startGmailConnect().catch((e) => setConnectErr(e.message)); }, []);
  return (
    <Shell>
      <TopBar>
        <span className="hz-small hz-ui">{profile.email}</span>
        <button type="button" className="hz-link" onClick={onSignOut}>Çıkış yap</button>
      </TopBar>
      <main className="hz-wrap">
        {notice && <p className={notice[0] === 'ok' ? 'hz-ok' : 'hz-notice'} role="status" style={{ marginBottom: 20 }}>{notice[1]}</p>}
        {connectErr && <p className="hz-notice" role="alert" style={{ marginBottom: 20 }}>{connectErr}</p>}
        <SetupCallout profile={profile} onStart={onStartSetup} gmail={gmail} onConnect={onConnect} />
        <div className="hz-panel">
          <nav className="hz-nav" aria-label="Panel">
            {TABS.map(([id, label]) => (
              <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
                {label}
                {id === 'inbox' && unread > 0 && <span className="hz-count" aria-label={`${unread} okunmamış`}>{unread}</span>}
              </button>
            ))}
          </nav>
          <section className="hz-sheet" aria-labelledby="panel-title">
            <h1 id="panel-title" className="hz-h2" style={{ padding: '22px 26px 6px' }}>{TABS.find((t) => t[0] === tab)[1]}</h1>
            {tab === 'inbox' && (inbox ? <InboxList items={inbox} /> : <InboxView onRead={onRead} />)}
            {tab === 'today' && (profile.setup_step >= 6 ? <PendingView gmail={gmail} onConnect={onConnect} /> : <Later text="Kurulumu tamamladığında her gün hazırlanan başvurular burada onayını bekleyecek." />)}
            {tab === 'applications' && <SentView />}
            {tab === 'listings' && <Later text="LinkedIn ve Kariyer.net alarmlarından gelen ilanlar burada puanlarıyla görünecek." />}
            {tab === 'settings' && <SettingsView gmail={gmail} reloadGmail={reloadGmail} onConnect={onConnect} onEditSetup={onStartSetup} />}
          </section>
        </div>
      </main>
      <Footer />
    </Shell>
  );
}

export function SetupPage({ profile, onExit, onDone, onSignOut }) {
  return (
    <Shell>
      <TopBar>
        <span className="hz-small hz-ui">{profile.email}</span>
        <button type="button" className="hz-link" onClick={onSignOut}>Çıkış yap</button>
      </TopBar>
      <main className="hz-narrow" style={{ paddingBottom: 64 }}>
        <Wizard profile={profile} onExit={onExit} onDone={onDone} />
      </main>
    </Shell>
  );
}

// ---- Uygulama ---------------------------------------------------------------
export default function AutomationApp() {
  const [session, setSession] = useState(undefined);
  const [me, setMe] = useState(null);
  const [unread, setUnread] = useState(0);
  const [err, setErr] = useState(null);
  const [setup, setSetup] = useState(false);
  // Google'dan Gmail izni dönüşü: ?gmail=ok|denied|… → bir kez göster, adresi temizle.
  const [notice] = useState(() => {
    const code = new URLSearchParams(window.location.search).get('gmail');
    if (code) window.history.replaceState(null, '', window.location.pathname);
    return code ? gmailReturnMessage(code) : null;
  });

  useEffect(() => {
    if (!authConfigured) return;
    completeRedirect()
      .catch((e) => setErr(e.message))
      .then(() => getSession())
      .then(setSession);
    return onAuthChange(setSession);
  }, []);

  const userKey = session ? session.user?.id || 'anon' : null;
  useEffect(() => {
    if (!userKey) { setMe(null); return; }
    setErr(null);
    getMe().then((r) => { setMe(r.profile); setUnread(r.unreadCount); }).catch((e) => setErr(e.message));
  }, [userKey]);

  if (!authConfigured) return <Shell><TopBar /><main className="hz-narrow"><p className="hz-notice">Başvuru asistanı henüz yapılandırılmadı.</p></main></Shell>;
  if (session === undefined) return <Shell><Spinner /></Shell>;
  if (!session) return <SignIn error={err} />;
  if (err) return <Shell><TopBar /><main className="hz-narrow" style={{ display: 'grid', gap: 14 }}><p className="hz-notice" role="alert">{err}</p><button type="button" className="hz-link" style={{ justifySelf: 'start' }} onClick={() => { setErr(null); signOut(); }}>Çıkış yap ve tekrar dene</button></main></Shell>;
  if (!me) return <Shell><Spinner /></Shell>;
  if (!me.kvkk_accepted_at) return <Consent email={me.email} onSignOut={signOut} onAccept={async () => setMe((await updateMe({ kvkk_accepted: true })).profile)} />;
  if (setup) return <SetupPage profile={me} onSignOut={signOut} onExit={() => { setSetup(false); getMe().then((r) => setMe(r.profile)).catch(() => {}); }} onDone={(p) => { setMe(p); setSetup(false); }} />;
  return <Panel profile={me} unread={unread} setUnread={setUnread} onSignOut={signOut} onStartSetup={() => setSetup(true)} notice={notice} />;
}
