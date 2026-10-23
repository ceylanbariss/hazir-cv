// Başvuru otomasyonu: giriş → KVKK onayı → panel. Geçici tasarım.
import React, { useEffect, useState, useCallback } from 'react';
import { Inbox, CalendarCheck, Send, ListChecks, Settings, LogOut, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { authConfigured, signInWithGoogle, completeRedirect, getSession, onAuthChange, signOut } from '../../lib/auth.js';
import { getMe, updateMe, getInbox, markInboxRead } from '../../lib/automationApi.js';
import { navigate } from '../../router.js';

const Shell = ({ children }) => <div className="min-h-screen bg-slate-950 text-slate-100">{children}</div>;

function Centered({ children }) {
  return (
    <Shell>
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8">{children}</div>
      </div>
    </Shell>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function SignIn() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  return (
    <Centered>
      <button onClick={() => navigate('/')} className="text-sm text-slate-400 hover:text-white inline-flex items-center gap-1 mb-6"><ArrowLeft className="h-4 w-4" /> Geri</button>
      <h1 className="text-2xl font-bold mb-2">Başvuru asistanını kur</h1>
      <p className="text-slate-400 mb-8 text-sm leading-relaxed">
        Bilgilerin ve başvuruların hesabında saklanır. Giriş için yalnızca adın ve e-posta adresin alınır; e-posta gönderme izni
        kurulumda ayrıca istenir.
      </p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true); setErr(null);
          try { await signInWithGoogle(); } catch { setErr('Google ile giriş başlatılamadı. Tekrar dene.'); setBusy(false); }
        }}
        className="w-full inline-flex items-center justify-center gap-3 rounded-xl bg-white text-slate-900 font-semibold py-3 hover:bg-slate-100 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleIcon />} Google ile devam et
      </button>
      {err && <p className="text-sm text-red-400 mt-4">{err}</p>}
    </Centered>
  );
}

function Consent({ onAccept }) {
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Centered>
      <h1 className="text-xl font-bold mb-3">Verilerin hakkında</h1>
      <div className="text-sm text-slate-300 space-y-2 mb-6 leading-relaxed">
        <p>Asistanın çalışabilmesi için CV'lerin, hedeflerin ve başvuru kayıtların hesabında saklanır. Bu bilgiler yalnızca senin için ilan bulmak, ön yazı hazırlamak ve senin onayınla başvuru göndermek için kullanılır.</p>
        <p>İstediğin an otomasyonu durdurabilir, Gmail bağlantısını kaldırabilir ve hesabını tüm verileriyle silebilirsin.</p>
        <p className="text-slate-500 text-xs">Ayrıntılı KVKK aydınlatma metni yayına çıkmadan önce eklenecek.</p>
      </div>
      <label className="flex gap-3 items-start text-sm mb-6 cursor-pointer">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-1" />
        <span>Okudum, verilerimin bu amaçla işlenmesini kabul ediyorum.</span>
      </label>
      <button
        disabled={!ok || busy}
        onClick={async () => { setBusy(true); await onAccept(); setBusy(false); }}
        className="w-full rounded-xl bg-emerald-500 text-white font-semibold py-3 disabled:opacity-40"
      >
        Devam et
      </button>
    </Centered>
  );
}

const TABS = [
  { id: 'inbox', label: 'Gelen kutusu', icon: Inbox },
  { id: 'today', label: 'Bugün', icon: CalendarCheck },
  { id: 'applications', label: 'Başvurular', icon: Send },
  { id: 'listings', label: 'İlanlar', icon: ListChecks },
  { id: 'settings', label: 'Ayarlar', icon: Settings },
];

const fmt = (iso) => new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

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
  if (err) return <ErrorBox text={err} />;
  if (!items) return <Spinner />;
  if (!items.length) return <Empty text="Henüz bildirim yok." />;
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-start justify-between gap-4">
            <h3 className="font-semibold flex items-center gap-2">
              {!i.read_at && <span className="h-2 w-2 rounded-full bg-emerald-400" />}{i.title}
            </h3>
            <span className="text-xs text-slate-500 whitespace-nowrap">{fmt(i.created_at)}</span>
          </div>
          {i.body && <p className="text-sm text-slate-300 mt-2 leading-relaxed whitespace-pre-line">{i.body}</p>}
        </li>
      ))}
    </ul>
  );
}

const Spinner = () => <div className="py-16 flex justify-center text-slate-500"><Loader2 className="h-6 w-6 animate-spin" /></div>;
const Empty = ({ text }) => <div className="py-16 text-center text-slate-500 text-sm">{text}</div>;
const ErrorBox = ({ text }) => (
  <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300 flex gap-2"><AlertCircle className="h-5 w-5 shrink-0" />{text}</div>
);
const Soon = ({ text }) => (
  <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center">
    <p className="text-slate-300 font-medium mb-1">Yakında</p>
    <p className="text-sm text-slate-500">{text}</p>
  </div>
);

function Panel({ profile, unread, setUnread, onSignOut }) {
  const [tab, setTab] = useState('inbox');
  const onRead = useCallback(() => setUnread(0), [setUnread]);
  return (
    <Shell>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <header className="flex items-center justify-between mb-8">
          <button onClick={() => navigate('/')} className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg" />
            <span className="font-bold">Başvuru asistanı</span>
          </button>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-sm text-slate-400">{profile.email}</span>
            {profile.avatar_url && <img src={profile.avatar_url} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />}
            <button onClick={onSignOut} title="Çıkış" className="p-2 rounded-lg hover:bg-white/10"><LogOut className="h-4 w-4" /></button>
          </div>
        </header>

        {profile.status === 'setup' && (
          <div className="rounded-2xl bg-emerald-500/10 border border-emerald-400/30 p-5 mb-8 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div>
              <p className="font-semibold">Merhaba {profile.full_name?.split(' ')[0] || ''}, kurulumu tamamla</p>
              <p className="text-sm text-slate-300">CV'lerini yükle, hedef rollerini ve şehirlerini seç; asistan her gün senin için çalışsın.</p>
            </div>
            <button disabled className="rounded-xl bg-emerald-500 px-5 py-2.5 font-semibold disabled:opacity-50 whitespace-nowrap" title="Faz 1'de açılacak">Kuruluma başla</button>
          </div>
        )}

        <div className="grid md:grid-cols-[220px_1fr] gap-6">
          <nav className="flex md:flex-col gap-1 overflow-x-auto">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm whitespace-nowrap ${tab === id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                <Icon className="h-4 w-4" /> {label}
                {id === 'inbox' && unread > 0 && <span className="ml-auto text-xs bg-emerald-500 text-white rounded-full px-2">{unread}</span>}
              </button>
            ))}
          </nav>
          <main>
            <h2 className="text-xl font-bold mb-5 flex items-center gap-2">{TABS.find((t) => t.id === tab).label}</h2>
            {tab === 'inbox' && <InboxView onRead={onRead} />}
            {tab === 'today' && <Soon text="Onay bekleyen başvurular burada listelenecek." />}
            {tab === 'applications' && <Soon text="Gönderilen başvurular ve durumları burada olacak." />}
            {tab === 'listings' && <Soon text="LinkedIn ve Kariyer.net alarmlarından gelen ilanlar burada puanlı görünecek." />}
            {tab === 'settings' && <Soon text="Mod, günlük limit, Gmail bağlantısı ve hesap silme burada olacak." />}
          </main>
        </div>
      </div>
    </Shell>
  );
}

export default function AutomationApp() {
  const [session, setSession] = useState(undefined);
  const [me, setMe] = useState(null);
  const [unread, setUnread] = useState(0);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!authConfigured) return;
    completeRedirect()
      .catch((e) => setErr(e.message))
      .then(() => getSession())
      .then(setSession);
    return onAuthChange(setSession);
  }, []);

  useEffect(() => {
    if (!session) { setMe(null); return; }
    setErr(null);
    getMe().then((r) => { setMe(r.profile); setUnread(r.unreadCount); }).catch((e) => setErr(e.message));
  }, [session?.access_token ? session.user?.id ?? 'x' : null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!authConfigured) {
    return <Centered><ErrorBox text="Başvuru otomasyonu henüz yapılandırılmadı (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY eksik)." /></Centered>;
  }
  if (session === undefined) return <Shell><Spinner /></Shell>;
  if (err) return <Centered><ErrorBox text={err} /><button onClick={() => { setErr(null); signOut(); }} className="mt-4 text-sm text-slate-400 underline">Çıkış yap</button></Centered>;
  if (!session) return <SignIn />;
  if (!me) return <Shell><Spinner /></Shell>;
  if (!me.kvkk_accepted_at) return <Consent onAccept={async () => setMe((await updateMe({ kvkk_accepted: true })).profile)} />;
  return <Panel profile={me} unread={unread} setUnread={setUnread} onSignOut={signOut} />;
}

