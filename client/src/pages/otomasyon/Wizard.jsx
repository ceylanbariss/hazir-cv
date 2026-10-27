// Kurulum sihirbazı (Faz 1): CV'ler → aradığın işler → konum → başvuru tercihleri.
import React, { useEffect, useRef, useState } from 'react';
import { getSetup, uploadCv, updateCv, deleteCv, suggestRoles, saveTargets, updateMe } from '../../lib/automationApi.js';
import { readPdf } from '../../lib/pdfText.js';
import { Spinner } from '../../hz/ui.jsx';

const STEPS = ['CV\'lerin', 'Aradığın işler', 'Konum ve çalışma şekli', 'Başvuru tercihleri'];
const SENIORITY = [
  ['intern', 'Stajyer'],
  ['junior', 'Yeni mezun / junior'],
  ['mid', 'Orta seviye'],
  ['senior', 'Kıdemli'],
];
const WORK_MODES = [
  ['remote', 'Uzaktan'],
  ['hybrid', 'Hibrit'],
  ['onsite', 'Ofiste'],
];
const CITIES = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Kocaeli', 'Antalya', 'Eskişehir', 'Konya', 'Adana', 'Sakarya', 'Kayseri', 'Gaziantep', 'Mersin', 'Tekirdağ', 'Samsun', 'Trabzon', 'Denizli', 'Muğla', 'Manisa', 'Bolu'];
const SENIORITY_LABEL = Object.fromEntries(SENIORITY);

function Progress({ step }) {
  return (
    <ol className="hz-progress" aria-label="Kurulum adımları">
      {STEPS.map((s, i) => (
        <li key={s} data-state={i < step ? 'done' : i === step ? 'current' : 'todo'} aria-current={i === step ? 'step' : undefined}>
          <b>{i + 1}</b>{s}
        </li>
      ))}
    </ol>
  );
}

function ChipInput({ label, hint, values, onChange, placeholder, suggestions, id }) {
  const [draft, setDraft] = useState('');
  const add = (v) => {
    const t = v.trim();
    if (!t) return;
    if (!values.some((x) => x.toLocaleLowerCase('tr') === t.toLocaleLowerCase('tr'))) onChange([...values, t]);
    setDraft('');
  };
  return (
    <div className="hz-field">
      <label className="hz-label" htmlFor={id}>{label}</label>
      {hint && <p className="hz-hint">{hint}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          id={id}
          className="hz-input"
          value={draft}
          list={suggestions ? `${id}-list` : undefined}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); } }}
        />
        <button type="button" className="hz-btn" onClick={() => add(draft)} disabled={!draft.trim()}>Ekle</button>
      </div>
      {suggestions && <datalist id={`${id}-list`}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
      {values.length > 0 && (
        <div className="hz-chips" style={{ marginTop: 4 }}>
          {values.map((v) => (
            <span className="hz-chip" key={v}>
              {v}
              <button type="button" aria-label={`${v} kaldır`} onClick={() => onChange(values.filter((x) => x !== v))}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Toggles({ legend, options, values, onChange }) {
  return (
    <fieldset className="hz-field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="hz-label" style={{ marginBottom: 8 }}>{legend}</legend>
      <div className="hz-toggle-row">
        {options.map(([v, l]) => (
          <label className="hz-toggle" key={v}>
            <input type="checkbox" checked={values.includes(v)} onChange={(e) => onChange(e.target.checked ? [...values, v] : values.filter((x) => x !== v))} />
            <span>{l}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ---- 1. CV'ler --------------------------------------------------------------
function StepCvs({ cvs, setCvs }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [over, setOver] = useState(false);
  const input = useRef(null);

  async function handle(file) {
    if (!file) return;
    setErr(null); setBusy(true);
    try {
      const { text, base64 } = await readPdf(file);
      const label = cvs.length === 0 ? 'Ana CV' : file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').slice(0, 40);
      const { cv } = await uploadCv({ label, fileName: file.name, fileBase64: base64, text });
      setCvs([...cvs, cv]);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  const act = async (fn) => { setErr(null); try { setCvs((await fn()).cvs); } catch (e) { setErr(e.message); } };

  return (
    <div className="hz-step">
      <div className="hz-step-head">
        <h2 className="hz-h1">CV'lerini yükle</h2>
        <p className="hz-lead" style={{ fontSize: 18 }}>Asistan CV yazmaz; her başvuruda buraya yüklediğin CV'lerden ilana en uygun olanı ekler. En fazla üç CV yükleyebilirsin, örneğin Türkçe ve İngilizce iki sürüm.</p>
      </div>

      {cvs.length > 0 && (
        <div>
          {cvs.map((cv) => {
            const p = cv.extracted_profile || {};
            return (
              <div className="hz-cv" key={cv.id}>
                <span className="hz-cv-icon" data-default={cv.is_default || undefined} aria-hidden="true" />
                <div style={{ display: 'grid', gap: 6 }}>
                  <input
                    className="hz-input"
                    aria-label="CV adı"
                    defaultValue={cv.label}
                    style={{ minHeight: 38, maxWidth: 320, fontWeight: 700 }}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== cv.label) act(() => updateCv(cv.id, { label: v })); }}
                  />
                  <p>{p.pending ? 'CV kaydedildi. Profil analizi şu an yapılamadı; asistan çalışmaya başlamadan önce tekrar denenecek.' : [p.headline, SENIORITY_LABEL[p.seniority], p.city].filter(Boolean).join(', ')}{cv.is_default ? ' Varsayılan CV.' : ''}</p>
                  {p.skills?.length > 0 && (
                    <div className="hz-chips">{p.skills.slice(0, 8).map((s) => <span className="hz-chip hz-chip-plain" key={s}>{s}</span>)}</div>
                  )}
                </div>
                <div className="hz-cv-actions">
                  {!cv.is_default && <button type="button" className="hz-link" onClick={() => act(() => updateCv(cv.id, { is_default: true }))}>Varsayılan yap</button>}
                  <button type="button" className="hz-link" onClick={() => act(() => deleteCv(cv.id))}>Sil</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cvs.length < 3 && (
        <label
          className="hz-drop"
          data-over={over || undefined}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files[0]); }}
        >
          <input ref={input} type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(e) => handle(e.target.files[0])} />
          {busy ? (
            <span className="hz-ui" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}><span className="hz-spin" />CV'n okunuyor ve analiz ediliyor</span>
          ) : (
            <>
              <span className="hz-h3">{cvs.length ? 'Bir CV daha ekle' : 'CV\'ni buraya bırak ya da seç'}</span>
              <span className="hz-hint">PDF, en fazla 5 MB. Metni seçilebilen bir PDF olmalı.</span>
            </>
          )}
        </label>
      )}
      {err && <p className="hz-notice" role="alert">{err}</p>}
    </div>
  );
}

// ---- 2. Aradığın işler ------------------------------------------------------
function StepRoles({ t, set }) {
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState(null);
  const [err, setErr] = useState(null);
  const fetchSuggestions = async () => {
    setErr(null); setBusy(true);
    try { setList((await suggestRoles(t.roles)).suggestions); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const visible = (list || []).filter((s) => !t.roles.some((r) => r.toLocaleLowerCase('tr') === s.title.toLocaleLowerCase('tr')));
  return (
    <div className="hz-step">
      <div className="hz-step-head">
        <h2 className="hz-h1">Hangi işlere başvuralım?</h2>
        <p className="hz-lead" style={{ fontSize: 18 }}>İlanlarda göreceğin unvanlarla yaz. Asistan bu rollerle arama yapar ve ilanları CV'ne göre puanlar.</p>
      </div>
      <ChipInput id="roles" label="Roller" values={t.roles} onChange={(roles) => set({ roles })} placeholder="Örneğin İş Analisti" />
      <div className="hz-field">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button type="button" className="hz-btn" onClick={fetchSuggestions} disabled={busy}>
            {busy ? <><span className="hz-spin" />Öneriler hazırlanıyor</> : list ? 'Yeni öneriler getir' : 'CV\'me göre rol öner'}
          </button>
          <span className="hz-hint">Öneriler varsayılan CV'ne ve seçtiğin rollere göre hazırlanır.</span>
        </div>
        {visible.length > 0 && (
          <ul className="hz-suggest" style={{ marginTop: 8 }}>
            {visible.map((s) => (
              <li key={s.title}>
                <strong>{s.title}</strong>
                <p>{s.reason}</p>
                <button type="button" className="hz-btn hz-btn-sm" onClick={() => set({ roles: [...t.roles, s.title] })}>Ekle</button>
              </li>
            ))}
          </ul>
        )}
        {list && visible.length === 0 && <p className="hz-hint">Önerilerin hepsini ekledin.</p>}
        {err && <p className="hz-notice" role="alert">{err}</p>}
      </div>
      <ChipInput id="excluded" label="İstemediğin ilanlar" hint="Başlığında bu kelimeler geçen ilanlar elenir." values={t.excluded} onChange={(excluded) => set({ excluded })} placeholder="Örneğin satış, çağrı merkezi" />
    </div>
  );
}

// ---- 3. Konum ---------------------------------------------------------------
function StepLocation({ t, set }) {
  return (
    <div className="hz-step">
      <div className="hz-step-head">
        <h2 className="hz-h1">Nerede çalışmak istiyorsun?</h2>
        <p className="hz-lead" style={{ fontSize: 18 }}>Ofis ve hibrit ilanlar bu şehirlerde aranır. Uzaktan ilanlarda şehir aranmaz.</p>
      </div>
      <ChipInput id="cities" label="Şehirler" values={t.cities} onChange={(cities) => set({ cities })} placeholder="Şehir yaz ya da listeden seç" suggestions={CITIES} />
      <Toggles legend="Çalışma şekli" options={WORK_MODES} values={t.work_modes} onChange={(work_modes) => set({ work_modes })} />
      <Toggles legend="Kıdem" options={SENIORITY} values={t.seniority} onChange={(seniority) => set({ seniority })} />
      {(t.seniority.includes('intern') || t.seniority.includes('junior')) && (
        <label className="hz-check">
          <input type="checkbox" checked={t.long_term_internship} onChange={(e) => set({ long_term_internship: e.target.checked })} />
          <span>Uzun dönem staj ilanlarını da dahil et. Okul stajı, yani zorunlu staj ilanları dahil edilmez.</span>
        </label>
      )}
    </div>
  );
}

// ---- 4. Tercihler -----------------------------------------------------------
function StepPrefs({ p, set }) {
  return (
    <div className="hz-step">
      <div className="hz-step-head">
        <h2 className="hz-h1">Başvurular nasıl gönderilsin?</h2>
        <p className="hz-lead" style={{ fontSize: 18 }}>Bunları sonradan Ayarlar'dan değiştirebilirsin.</p>
      </div>
      <fieldset className="hz-field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="hz-label" style={{ marginBottom: 8 }}>Gönderim</legend>
        <div className="hz-modes">
          <label className="hz-mode">
            <input type="radio" name="mode" checked={p.mode === 'approval'} onChange={() => set({ mode: 'approval' })} />
            <em>Önerilen</em>
            <strong>Ben onaylayınca</strong>
            <p>Hazırlanan başvurular her gün panele düşer. Ön yazıyı okur, tek tıkla gönderir ya da atlarsın.</p>
          </label>
          <label className="hz-mode">
            <input type="radio" name="mode" checked={p.mode === 'auto'} onChange={() => set({ mode: 'auto' })} />
            <strong>Otomatik</strong>
            <p>Puanı yüksek başvurular onay beklemeden gönderilir. İlk hafta güvenlik için yine onayın istenir.</p>
          </label>
        </div>
      </fieldset>
      <div className="hz-grid-2">
        <div className="hz-field">
          <span className="hz-label" id="limit-l">Günde en fazla</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="hz-stepper" role="group" aria-labelledby="limit-l">
              <button type="button" aria-label="Azalt" onClick={() => set({ daily_limit: Math.max(1, p.daily_limit - 1) })}>−</button>
              <output aria-live="polite">{p.daily_limit}</output>
              <button type="button" aria-label="Artır" onClick={() => set({ daily_limit: Math.min(30, p.daily_limit + 1) })}>+</button>
            </div>
            <span className="hz-hint">başvuru</span>
          </div>
        </div>
        <div className="hz-field">
          <label className="hz-label" htmlFor="cooldown">Aynı şirkete tekrar yazma</label>
          <select id="cooldown" className="hz-input" value={p.company_cooldown_days} onChange={(e) => set({ company_cooldown_days: Number(e.target.value) })}>
            {[15, 30, 60, 90].map((d) => <option key={d} value={d}>{d} gün sonra</option>)}
          </select>
        </div>
      </div>
      <label className="hz-check">
        <input type="checkbox" checked={p.open_applications} onChange={(e) => set({ open_applications: e.target.checked })} />
        <span>İlan açmamış ama işe alım yapan şirketlere açık başvuru da gönder.</span>
      </label>
      <div className="hz-field">
        <label className="hz-label" htmlFor="portfolio">Portfolyo bağlantısı (isteğe bağlı)</label>
        <p className="hz-hint">Behance, kişisel site veya GitHub. Ön yazının sonuna eklenir.</p>
        <input id="portfolio" className="hz-input" type="url" inputMode="url" placeholder="https://" value={p.portfolio_url} onChange={(e) => set({ portfolio_url: e.target.value })} />
      </div>
    </div>
  );
}

// ---- Sihirbaz ---------------------------------------------------------------
export default function Wizard({ profile, onExit, onDone }) {
  const [data, setData] = useState(null);
  const [step, setStep] = useState(Math.min(Math.max((profile.setup_step || 1) - 2, 0), 3));
  const [cvs, setCvs] = useState([]);
  const [t, setT] = useState(null);
  const [p, setP] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const top = useRef(null);

  useEffect(() => {
    getSetup()
      .then((d) => {
        setData(d);
        setCvs(d.cvs);
        const seniority = d.cvs.find((c) => c.is_default)?.extracted_profile?.seniority;
        setT(d.targets || { roles: [], excluded: [], cities: [], work_modes: ['remote', 'hybrid'], seniority: seniority ? [seniority] : ['junior'], long_term_internship: true });
        setP({ mode: d.profile.mode, daily_limit: d.profile.daily_limit, company_cooldown_days: d.profile.company_cooldown_days, open_applications: d.profile.open_applications, portfolio_url: d.profile.portfolio_url || '' });
      })
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => { top.current?.scrollIntoView({ block: 'start' }); }, [step]);

  if (err && !data) return <p className="hz-notice" role="alert">{err}</p>;
  if (!data || !t || !p) return <Spinner />;

  const canNext = [cvs.length > 0, t.roles.length > 0, t.work_modes.length > 0 && t.seniority.length > 0, true][step];
  const blocker = ['Devam etmek için en az bir CV yükle.', 'Devam etmek için en az bir rol ekle.', 'Bir çalışma şekli ve bir kıdem seç.', ''][step];

  async function next() {
    setErr(null); setSaving(true);
    try {
      if (step === 2) await saveTargets({ roles: t.roles, excluded: t.excluded, cities: t.cities, work_modes: t.work_modes, seniority: t.seniority, long_term_internship: t.long_term_internship });
      if (step === 3) {
        const { profile: updated } = await updateMe({ ...p, setup_step: 6 });
        return onDone(updated);
      }
      await updateMe({ setup_step: step + 3 });
      setStep(step + 1);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={top} style={{ scrollMarginTop: 16 }}>
      <Progress step={step} />
      <section className="hz-sheet hz-pad" aria-live="polite">
        {step === 0 && <StepCvs cvs={cvs} setCvs={setCvs} />}
        {step === 1 && <StepRoles t={t} set={(x) => setT({ ...t, ...x })} />}
        {step === 2 && <StepLocation t={t} set={(x) => setT({ ...t, ...x })} />}
        {step === 3 && <StepPrefs p={p} set={(x) => setP({ ...p, ...x })} />}
        {err && <p className="hz-notice" role="alert" style={{ marginTop: 20 }}>{err}</p>}
        <div className="hz-step-foot" style={{ marginTop: 28 }}>
          <button type="button" className="hz-link" onClick={() => (step === 0 ? onExit() : setStep(step - 1))}>{step === 0 ? 'Panele dön' : 'Geri'}</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {!canNext && <span className="hz-hint">{blocker}</span>}
            <button type="button" className="hz-btn hz-btn-posta" onClick={next} disabled={!canNext || saving}>
              {saving ? <><span className="hz-spin" />Kaydediliyor</> : step === 3 ? 'Kurulumu kaydet' : 'Devam et'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
