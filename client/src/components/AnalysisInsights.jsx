import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle, ChevronDown, Undo2, Info, Activity, Quote } from 'lucide-react';

const T = {
  tr: {
    why: 'Bu skor nasıl hesaplandı?',
    whyDesc: 'Skoru yapay zeka uydurmaz. İlandaki her gereksinim CV\'deki kanıtla eşleştirilir; puan bu eşleşmelerden formülle hesaplanır (zorunlu = 3, tercih = 1 ağırlık; karşılıyor = 1, kısmen = 0,5).',
    status: { met: 'Karşılıyor', partial: 'Kısmen', missing: 'Eksik', claimed: 'Beyan edildi' },
    importance: { must: 'Zorunlu', nice: 'Tercih' },
    evidence: 'CV\'deki kanıt',
    unverified: 'Alıntı CV\'de bulunamadı, puan bir seviye düşürüldü',
    points: 'puan',
    verifyTitle: 'Doğruluk Kontrolü',
    verifyDesc: 'Yeniden yazılan her cümle orijinal CV\'nizle karşılaştırıldı. Desteklenmeyen ifadeler otomatik olarak düzeltildi.',
    grounded: 'CV\'nizle desteklenen ifade',
    autoFixed: 'otomatik düzeltildi',
    flagged: 'Gözden geçirmeniz önerilen ifadeler',
    verdict: { embellished: 'Abartılı olabilir', unsupported: 'Desteklenmiyor' },
    remediation: { reverted_to_original: 'Orijinal metne döndürüldü', removed: 'Kaldırıldı' },
    revert: 'Orijinal metne dön',
    reverted: 'Döndürüldü',
    allGood: 'Tüm ifadeler orijinal CV\'nizle tutarlı.',
    entity: 'Kontrol edin: CV\'de bulunmayan şirket/tarih bilgisi',
    injection: 'CV\'nizde yapay zekaya yönelik talimat benzeri bir ifade tespit edildi; değerlendirmede yok sayıldı.',
    trace: 'İşlem detayları',
    stageNames: { analyze_inputs: 'Girdi analizi', match_evidence: 'Kanıt eşleştirme', tailor: 'Yeniden yazım', verify: 'Doğrulama' },
    calls: 'model çağrısı',
  },
  en: {
    why: 'How was this score calculated?',
    whyDesc: 'The AI does not make up the score. Every requirement in the posting is matched to evidence in your CV, and the score is computed from those matches (must-have = 3, nice-to-have = 1; met = 1, partial = 0.5).',
    status: { met: 'Met', partial: 'Partial', missing: 'Missing', claimed: 'Self-declared' },
    importance: { must: 'Must', nice: 'Nice' },
    evidence: 'Evidence in your CV',
    unverified: 'Quote not found in CV, downgraded one level',
    points: 'pts',
    verifyTitle: 'Fact Check',
    verifyDesc: 'Every rewritten sentence was checked against your original CV. Unsupported statements were fixed automatically.',
    grounded: 'statements backed by your CV',
    autoFixed: 'auto-fixed',
    flagged: 'Statements worth reviewing',
    verdict: { embellished: 'May be exaggerated', unsupported: 'Not supported' },
    remediation: { reverted_to_original: 'Reverted to original', removed: 'Removed' },
    revert: 'Revert to original',
    reverted: 'Reverted',
    allGood: 'All statements are consistent with your original CV.',
    entity: 'Please check: company/date not found in your CV',
    injection: 'Your CV contains text that looks like instructions to an AI; it was ignored.',
    trace: 'Processing details',
    stageNames: { analyze_inputs: 'Input analysis', match_evidence: 'Evidence matching', tailor: 'Rewrite', verify: 'Verification' },
    calls: 'model calls',
  },
};

const STATUS_STYLE = {
  met: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  missing: 'bg-rose-50 text-rose-700 border-rose-200',
  claimed: 'bg-sky-50 text-sky-700 border-sky-200',
};

function Section({ icon, title, right, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-bold text-slate-800">{icon}{title}</span>
        <span className="flex items-center gap-2 shrink-0">
          {right}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-slate-100">{children}</div>}
    </div>
  );
}

export function RequirementBreakdown({ analysis, lang = 'tr' }) {
  const t = T[lang] || T.tr;
  const reqs = analysis?.requirements || [];
  if (!reqs.length) return null;
  const metCount = reqs.filter((r) => r.status === 'met' || r.status === 'claimed').length;
  return (
    <Section
      icon={<Info className="w-4 h-4 text-slate-700" />}
      title={t.why}
      right={<span className="text-[11px] font-bold text-slate-500">{metCount}/{reqs.length}</span>}
    >
      <p className="text-[11px] leading-relaxed text-slate-500 mb-3">{t.whyDesc}</p>
      <ul className="space-y-2">
        {reqs.map((r) => (
          <li key={r.id} className="p-3 rounded-lg border border-slate-100 bg-slate-50/60">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${STATUS_STYLE[r.status] || STATUS_STYLE.missing}`}>
                    {t.status[r.status] || r.status}
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.importance === 'must' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    {t.importance[r.importance]}
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-800 break-words">{r.text}</p>
                {r.rationale && <p className="text-[11px] text-slate-500 mt-0.5">{r.rationale}</p>}
              </div>
              {r.contribution && (
                <span className="text-[10px] font-mono font-bold text-slate-500 whitespace-nowrap" title={t.points}>
                  +{r.status === 'claimed' ? r.contribution.max : r.contribution.earned}/{r.contribution.max}
                </span>
              )}
            </div>
            {r.evidence?.length > 0 && (
              <div className="mt-2 space-y-1">
                {r.evidence.map((e, i) => (
                  <p key={i} className={`text-[11px] flex items-start gap-1.5 ${e.verified ? 'text-slate-600' : 'text-amber-700'}`}>
                    <Quote className="w-3 h-3 mt-0.5 shrink-0 opacity-60" />
                    <span className="italic break-words">“{e.quote}”{!e.verified && <span className="not-italic font-semibold"> — {t.unverified}</span>}</span>
                  </p>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function VerificationPanel({ verification, lang = 'tr', inputFlags = [], onRevert, revertedIds = [] }) {
  const t = T[lang] || T.tr;
  if (!verification?.summary) return null;
  const { summary, claims = [], entity_issues: entities = [] } = verification;
  const flagged = claims.filter((c) => c.verdict !== 'supported');
  const pct = Math.round((summary.grounded_ratio || 0) * 100);
  return (
    <Section
      defaultOpen={flagged.length > 0 || inputFlags.length > 0}
      icon={<ShieldCheck className="w-4 h-4 text-emerald-600" />}
      title={t.verifyTitle}
      right={
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${pct >= 85 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          %{pct}
        </span>
      }
    >
      <p className="text-[11px] leading-relaxed text-slate-500 mb-3">{t.verifyDesc}</p>
      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100">
          <div className="text-lg font-black text-emerald-700">{summary.supported}/{summary.total}</div>
          <div className="text-[10px] font-semibold text-emerald-700 leading-tight">{t.grounded}</div>
        </div>
        <div className="p-2 rounded-lg bg-amber-50 border border-amber-100">
          <div className="text-lg font-black text-amber-700">{summary.embellished}</div>
          <div className="text-[10px] font-semibold text-amber-700 leading-tight">{t.verdict.embellished}</div>
        </div>
        <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
          <div className="text-lg font-black text-slate-700">{summary.auto_fixed}</div>
          <div className="text-[10px] font-semibold text-slate-600 leading-tight">{t.autoFixed}</div>
        </div>
      </div>

      {inputFlags.length > 0 && (
        <p className="mb-3 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 flex gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {t.injection}
        </p>
      )}

      {flagged.length === 0 ? (
        <p className="text-xs text-emerald-700 font-semibold flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> {t.allGood}</p>
      ) : (
        <>
          <p className="text-[11px] font-bold text-slate-700 mb-2">{t.flagged}</p>
          <ul className="space-y-2">
            {flagged.map((c) => {
              const reverted = revertedIds.includes(c.id);
              return (
                <li key={c.id} className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/60">
                  <div className="flex items-center gap-1.5 mb-1">
                    {c.verdict === 'unsupported' ? <XCircle className="w-3.5 h-3.5 text-rose-500" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                    <span className="text-[10px] font-bold text-slate-600">{t.verdict[c.verdict]}</span>
                    {c.remediation && <span className="text-[10px] font-semibold text-emerald-700 ml-auto">✓ {t.remediation[c.remediation]}</span>}
                  </div>
                  <p className={`text-xs text-slate-700 break-words ${c.remediation ? 'line-through opacity-60' : ''}`}>{c.text}</p>
                  {c.note && <p className="text-[11px] text-slate-500 mt-1">{c.note}</p>}
                  {!c.remediation && c.section === 'experience' && c.source && onRevert && (
                    <button
                      type="button"
                      disabled={reverted}
                      onClick={() => onRevert(c)}
                      className="mt-2 text-[11px] font-bold flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50"
                    >
                      <Undo2 className="w-3 h-3" /> {reverted ? t.reverted : t.revert}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {entities.length > 0 && (
        <div className="mt-3 text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2">
          <p className="font-bold mb-1">{t.entity}</p>
          {entities.map((e, i) => <p key={i}>• {e.value}</p>)}
        </div>
      )}
    </Section>
  );
}

export function PipelineTrace({ meta, lang = 'tr' }) {
  const t = T[lang] || T.tr;
  if (!meta?.stages?.length) return null;
  const total = meta.stages.reduce((s, x) => s + x.ms, 0) || 1;
  return (
    <Section
      icon={<Activity className="w-4 h-4 text-slate-600" />}
      title={t.trace}
      right={<span className="text-[11px] font-mono text-slate-500">{(meta.latencyMs / 1000).toFixed(1)} sn</span>}
    >
      <div className="space-y-1.5 mb-3">
        {meta.stages.map((s) => (
          <div key={s.name} className="flex items-center gap-2 text-[11px]">
            <span className="w-28 shrink-0 text-slate-600 font-semibold">{t.stageNames[s.name] || s.name}</span>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-slate-800 rounded-full" style={{ width: `${Math.max(4, (s.ms / total) * 100)}%` }} />
            </div>
            <span className="w-14 text-right font-mono text-slate-500">{(s.ms / 1000).toFixed(1)}s</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] font-mono text-slate-400 leading-relaxed">
        {meta.llmCalls} {t.calls} · {meta.model} · {meta.tokens?.input?.toLocaleString()} in / {(meta.tokens?.output + (meta.tokens?.thinking || 0))?.toLocaleString()} out tokens · ~${meta.costUsd} · prompt v{meta.promptVersion}
        {meta.requestId && <> · id {String(meta.requestId).slice(0, 8)}</>}
      </p>
    </Section>
  );
}
