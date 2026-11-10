// CV aracının ek parçaları: ilan bağlantısından getirme, ATS kontrolü, ön yazı ve asistan bağlantısı.
import React, { useMemo, useState } from 'react';
import { Link as LinkIcon, RefreshCw, ShieldCheck, Check, AlertTriangle, PenLine, Copy, Mail, Download, Bot, ArrowRight, Sparkles } from 'lucide-react';
import { fetchJobFromUrl, coverLetter as coverLetterApi } from '../lib/api.js';
import { navigate } from '../router.js';

const T = (lang, tr, en) => (lang === 'en' ? en : tr);

// ---------------------------------------------------------------------------
// İlan bağlantısından getir
// ---------------------------------------------------------------------------
export function JobLinkImport({ onText, initialUrl = '', autoFetch = false }) {
  const [url, setUrl] = useState(initialUrl);
  const [state, setState] = useState({ loading: false, error: '', ok: '' });

  const run = async (target = url) => {
    const u = target.trim();
    if (!u) return;
    setState({ loading: true, error: '', ok: '' });
    try {
      const job = await fetchJobFromUrl(u);
      onText(job.text);
      setState({ loading: false, error: '', ok: [job.title, job.company].filter(Boolean).join(' · ') || 'İlan metni eklendi.' });
    } catch (e) {
      setState({ loading: false, error: e.message || 'İlan getirilemedi.', ok: '' });
    }
  };

  // ?ilan= bağlantısıyla gelindiyse bir kez otomatik getir.
  const started = React.useRef(false);
  React.useEffect(() => {
    if (autoFetch && initialUrl && !started.current) {
      started.current = true;
      run(initialUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetch, initialUrl]);

  return (
    <div className="mb-2">
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <LinkIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder="İlan bağlantısını yapıştır (LinkedIn, Kariyer.net, şirket sayfası)"
            className="w-full pl-8 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-black focus:border-transparent outline-none placeholder-slate-400"
          />
        </div>
        <button
          onClick={() => run()}
          disabled={state.loading || !url.trim()}
          className="shrink-0 flex items-center gap-1.5 text-xs bg-black text-white px-3.5 rounded-xl font-bold hover:bg-slate-800 disabled:opacity-40 transition-colors"
        >
          {state.loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
          {state.loading ? 'Getiriliyor' : 'Getir'}
        </button>
      </div>
      {state.ok && <p className="mt-1.5 text-[11px] font-semibold text-emerald-700 flex items-center gap-1"><Check className="w-3 h-3" /> {state.ok}</p>}
      {state.error && <p className="mt-1.5 text-[11px] font-semibold text-amber-800">{state.error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ATS uyumluluk kontrolü (tarayıcıda, yapay zeka kullanmadan)
// ---------------------------------------------------------------------------
const filled = (s) => typeof s === 'string' && s.trim().length > 0;

export function atsChecks(data, lang = 'tr') {
  if (!data) return { score: 0, items: [] };
  const exp = data.experience || [];
  const summary = data.summary_v1 || data.summary_v3 || data.summary || '';
  const reqs = data.analysis?.requirements || [];
  const must = reqs.filter((r) => r.importance === 'must');
  const covered = must.filter((r) => r.status === 'met' || r.status === 'partial');
  const missingMust = must.filter((r) => r.status === 'missing').map((r) => r.keywords?.[0] || r.text);
  const bullets = exp.flatMap((e) => e.bullets || e.bullets_v1 || []);
  const items = [
    { id: 'email', w: 12, ok: filled(data.email), label: T(lang, 'E-posta adresi', 'E-mail address'), tip: T(lang, 'İşe alımcı sana ulaşamaz; iletişim bölümüne e-postanı ekle.', 'Add your e-mail to the contact line.') },
    { id: 'phone', w: 10, ok: filled(data.phone), label: T(lang, 'Telefon numarası', 'Phone number'), tip: T(lang, 'Telefon numaranı ekle.', 'Add a phone number.') },
    { id: 'linkedin', w: 6, ok: filled(data.linkedin), label: 'LinkedIn', tip: T(lang, 'LinkedIn profil bağlantını ekle; çoğu işe alımcı bakar.', 'Add your LinkedIn URL.') },
    { id: 'title', w: 8, ok: filled(data.title), label: T(lang, 'Unvan / hedef pozisyon', 'Headline / target title'), tip: T(lang, 'Adının altına hedef pozisyonu yaz.', 'Add a headline under your name.') },
    { id: 'summary', w: 10, ok: summary.trim().split(/\s+/).length >= 20, label: T(lang, 'Profil özeti', 'Profile summary'), tip: T(lang, 'En az iki cümlelik bir özet ATS aramalarında öne çıkarır.', 'Add a 2+ sentence summary.') },
    { id: 'dates', w: 10, ok: exp.length > 0 && exp.every((e) => filled(e.date)), label: T(lang, 'Deneyimlerde tarih', 'Dates on every role'), tip: T(lang, 'Her deneyime başlangıç–bitiş tarihi ekle (ör. 03/2024 – 09/2024).', 'Add start–end dates to every role.') },
    { id: 'bullets', w: 10, ok: exp.length > 0 && exp.every((e) => (e.bullets || e.bullets_v1 || []).length >= 2), label: T(lang, 'Deneyim maddeleri', 'Bullet points per role'), tip: T(lang, 'Her deneyimde en az iki madde olsun.', 'Use at least two bullets per role.') },
    { id: 'length', w: 6, ok: bullets.every((b) => String(b).length <= 260), label: T(lang, 'Kısa ve okunur maddeler', 'Concise bullets'), tip: T(lang, 'Çok uzun maddeleri ikiye böl.', 'Split very long bullets.') },
    { id: 'skills', w: 10, ok: (data.skills || []).length >= 5, label: T(lang, 'Yetenekler bölümü', 'Skills section'), tip: T(lang, 'En az 5 yetenek listele; ATS bu bölümde anahtar kelime arar.', 'List at least 5 skills.') },
    { id: 'education', w: 6, ok: (data.education || []).length > 0, label: T(lang, 'Eğitim bilgisi', 'Education'), tip: T(lang, 'Eğitim bölümünü ekle.', 'Add your education.') },
    {
      id: 'keywords',
      w: 12,
      ok: !must.length || covered.length / must.length >= 0.7,
      label: T(lang, `İlanın zorunlu anahtar kelimeleri (${covered.length}/${must.length || 0})`, `Must-have keywords (${covered.length}/${must.length || 0})`),
      tip: missingMust.length ? T(lang, `Eksik: ${missingMust.slice(0, 5).join(', ')}. Gerçekten varsa "Eksik yetkinlikler"den ekle.`, `Missing: ${missingMust.slice(0, 5).join(', ')}.`) : '',
    },
  ];
  const total = items.reduce((s, i) => s + i.w, 0);
  const score = Math.round((items.filter((i) => i.ok).reduce((s, i) => s + i.w, 0) / total) * 100);
  return { score, items };
}

export function AtsCheck({ data, lang }) {
  const { score, items } = useMemo(() => atsChecks(data, lang), [data, lang]);
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const bad = items.filter((i) => !i.ok);
  const tone = score >= 85 ? 'emerald' : score >= 65 ? 'amber' : 'rose';
  const ring = { emerald: 'border-emerald-500 text-emerald-700', amber: 'border-amber-500 text-amber-700', rose: 'border-rose-500 text-rose-700' }[tone];
  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-6">
      <div className="flex items-center gap-4">
        <div className={`w-14 h-14 shrink-0 rounded-full border-4 flex items-center justify-center font-black text-lg ${ring}`}>{score}</div>
        <div className="flex-1 min-w-0">
          <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-800"><ShieldCheck className="w-4 h-4" /> {T(lang, 'ATS uyumluluğu', 'ATS readiness')}</h4>
          <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
            {bad.length
              ? T(lang, `${bad.length} küçük düzeltmeyle aday takip sistemlerinde (ATS) daha kolay bulunursun.`, `${bad.length} quick fixes will make you easier to find in applicant tracking systems.`)
              : T(lang, 'CV\'n aday takip sistemlerinin okuyacağı her şeyi içeriyor.', 'Your CV has everything ATS software looks for.')}
          </p>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="shrink-0 text-[11px] font-bold text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50">
          {open ? T(lang, 'Gizle', 'Hide') : T(lang, 'Detay', 'Details')}
        </button>
      </div>
      {open && (
        <ul className="mt-4 space-y-1.5">
          {[...bad, ...items.filter((i) => i.ok)].map((i) => (
            <li key={i.id} className="flex items-start gap-2 text-xs">
              {i.ok ? <Check className="w-3.5 h-3.5 mt-0.5 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-amber-600 shrink-0" />}
              <span className={i.ok ? 'text-slate-500' : 'text-slate-800 font-semibold'}>
                {i.label}
                {!i.ok && i.tip && <span className="block font-normal text-slate-500">{i.tip}</span>}
              </span>
            </li>
          ))}
          <li className="pt-2 text-[10px] text-slate-400">{T(lang, 'İndirdiğin PDF seçilebilir metin içerir; ATS yazıları doğrudan okuyabilir.', 'The PDF you download contains selectable text that ATS software can read.')}</li>
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CV'den çıkarılması önerilenler (çıkarılmaz, yalnızca önerilir) ve kaybolan bölüm uyarısı
// ---------------------------------------------------------------------------
export function KeptContentNotes({ analysis, lang }) {
  const dropped = analysis?.dropped_sections || [];
  const sugg = analysis?.removal_suggestions || [];
  if (!dropped.length && !sugg.length) return null;
  return (
    <div className="space-y-3 mb-6">
      {dropped.length > 0 && (
        <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {T(lang, `Orijinal CV'ndeki ${dropped.map((d) => `"${d}"`).join(', ')} bölümü yeni CV'de yer almıyor. Analizi yeniden çalıştırabilir ya da "Yeni madde ekle" ile ekleyebilirsin.`, `Your original CV's ${dropped.join(', ')} section is missing. Re-run the analysis or add it with "Add item".`)}
        </p>
      )}
      {sugg.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-800"><Sparkles className="w-4 h-4" /> {T(lang, 'Çıkarmayı düşünebileceklerin', 'You might remove')}</h4>
          <p className="text-[11px] text-slate-500 mt-0.5 mb-3">{T(lang, 'CV\'ndeki hiçbir şeyi silmedik. Aşağıdakiler bu ilan için zayıf kalıyor; istersen önizlemede üzerine gelip çöp kutusuyla kaldırabilirsin.', 'Nothing was removed. These look weak for this job; hover them in the preview and use the bin icon if you want to remove them.')}</p>
          <ul className="space-y-2">
            {sugg.map((r, i) => (
              <li key={i} className="text-xs">
                <span className="font-semibold text-slate-800">{r.item}</span>
                {r.reason && <span className="block text-slate-500">{r.reason}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// İlana özel ön yazı
// ---------------------------------------------------------------------------
export function CoverLetterPanel({ cv, jobPosting, lang, name }) {
  const [tone, setTone] = useState('formal');
  const [state, setState] = useState({ loading: false, error: '' });
  const [out, setOut] = useState(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setState({ loading: true, error: '' });
    try {
      const r = await coverLetterApi({ cv, jobPosting, lang, tone, name: name || undefined });
      setOut({ subject: r.subject, letter: r.letter, unsupported: r.unsupported || [] });
      setState({ loading: false, error: '' });
    } catch (e) {
      setState({ loading: false, error: e.message || 'Ön yazı hazırlanamadı.' });
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(out.letter);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* pano izni yoksa sessizce geç */
    }
  };
  const download = () => {
    const blob = new Blob([`${out.subject}\n\n${out.letter}\n`], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = lang === 'en' ? 'cover-letter.txt' : 'on-yazi.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const mailto = out ? `mailto:?subject=${encodeURIComponent(out.subject)}&body=${encodeURIComponent(out.letter)}` : '#';
  const toneBtn = (id, label) => (
    <button key={id} onClick={() => setTone(id)} className={`flex-1 py-2 rounded-lg text-[11px] font-bold border transition-colors ${tone === id ? 'bg-black text-white border-black' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
      {label}
    </button>
  );

  return (
    <div className="mt-8 pt-8 border-t border-slate-100">
      <h3 className="flex items-center gap-2 font-bold text-lg mb-1 text-slate-800"><PenLine className="w-5 h-5 text-black" />{T(lang, 'İlana özel ön yazı', 'Cover letter for this job')}</h3>
      <p className="text-xs text-slate-500 mb-4">{T(lang, 'Yalnızca CV\'ndeki bilgilerle, ilanın en önemli şartlarına göre yazılır. Hiçbir şey uydurulmaz.', 'Written only from your CV, around the posting\'s key requirements. Nothing is invented.')}</p>
      <div className="flex gap-2 mb-3">
        {toneBtn('formal', T(lang, 'Resmi', 'Formal'))}
        {toneBtn('warm', T(lang, 'Samimi', 'Warm'))}
      </div>
      <button
        onClick={generate}
        disabled={state.loading || !cv || !jobPosting}
        className="w-full bg-black text-white px-4 py-3 rounded-xl font-bold hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50 text-sm"
      >
        {state.loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {state.loading ? T(lang, 'Yazılıyor…', 'Writing…') : out ? T(lang, 'Yeniden yaz', 'Rewrite') : T(lang, 'Ön yazı oluştur', 'Write cover letter')}
      </button>
      {state.error && <p className="mt-2 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">{state.error}</p>}
      {out && (
        <div className="mt-4 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <input
            value={out.subject}
            onChange={(e) => setOut({ ...out, subject: e.target.value })}
            className="w-full px-4 py-3 text-xs font-bold text-slate-800 border-b border-slate-100 outline-none"
            aria-label={T(lang, 'Konu', 'Subject')}
          />
          <textarea
            value={out.letter}
            onChange={(e) => setOut({ ...out, letter: e.target.value })}
            rows={17}
            className="w-full px-4 py-3 text-[13px] leading-relaxed text-slate-700 outline-none resize-y"
          />
          {out.unsupported.length > 0 && (
            <p className="mx-4 mb-3 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 flex gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {T(lang, `CV'nde geçmeyen sayılar var (${out.unsupported.join(', ')}); göndermeden önce kontrol et.`, `Numbers not found in your CV: ${out.unsupported.join(', ')}. Check before sending.`)}
            </p>
          )}
          <div className="grid grid-cols-3 border-t border-slate-100 text-[11px] font-bold">
            <button onClick={copy} className="py-3 flex items-center justify-center gap-1.5 hover:bg-slate-50">{copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}{copied ? T(lang, 'Kopyalandı', 'Copied') : T(lang, 'Kopyala', 'Copy')}</button>
            <a href={mailto} className="py-3 flex items-center justify-center gap-1.5 hover:bg-slate-50 border-x border-slate-100 text-slate-800"><Mail className="w-3.5 h-3.5" />{T(lang, 'E-postada aç', 'Open in mail')}</a>
            <button onClick={download} className="py-3 flex items-center justify-center gap-1.5 hover:bg-slate-50"><Download className="w-3.5 h-3.5" />{T(lang, 'İndir', 'Download')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Başvuru asistanına geçiş
// ---------------------------------------------------------------------------
export function AssistantCta({ lang, role }) {
  return (
    <div className="mt-8 rounded-2xl bg-slate-900 text-white p-5 shadow-lg relative overflow-hidden">
      <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/5" />
      <div className="flex items-start gap-3 relative">
        <div className="w-10 h-10 shrink-0 rounded-xl bg-white/10 flex items-center justify-center"><Bot className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h4 className="font-bold text-sm">{T(lang, role ? `"${role}" ilanlarını her gün senin için bulalım` : 'Benzer ilanları her gün senin için bulalım', role ? `Get "${role}" jobs found for you every day` : 'Get similar jobs found for you every day')}</h4>
          <p className="text-xs text-white/70 mt-1 leading-relaxed">
            {T(lang, 'Başvuru asistanı bu CV ile sana uygun ilanları tarar, her biri için ön yazı hazırlar ve sen onaylayınca kendi Gmail\'inden gönderir. Ücretsiz.', 'The assistant scans for matching jobs, drafts a letter for each and sends from your Gmail once you approve. Free.')}
          </p>
          <button onClick={() => navigate(role ? `/otomasyon?rol=${encodeURIComponent(role)}` : '/otomasyon')} className="mt-3 inline-flex items-center gap-1.5 bg-white text-slate-900 text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-slate-100 active:scale-[0.98] transition-all">
            {role ? T(lang, 'Bu rolü asistanıma ekle', 'Add this role to my assistant') : T(lang, 'Başvuru asistanını kur', 'Set up the assistant')} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
