// Açılış ekranı: iki ürün kartı. Geçici tasarım — son aşamada yenilenecek.
import React from 'react';
import { FileText, Send, ArrowRight, Sparkles } from 'lucide-react';
import { navigate } from '../router.js';

function Card({ icon: Icon, title, text, points, cta, onClick, accent, badge }) {
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-3xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] hover:border-white/20 p-7 sm:p-8 transition-all flex flex-col"
    >
      <div className="flex items-center justify-between mb-6">
        <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${accent}`}>
          <Icon className="h-6 w-6 text-white" />
        </span>
        {badge && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-400/15 text-emerald-300">{badge}</span>}
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
      <p className="text-slate-300 mb-5 leading-relaxed">{text}</p>
      <ul className="space-y-1.5 text-sm text-slate-400 mb-8">
        {points.map((p) => (
          <li key={p} className="flex gap-2"><span className="text-slate-500">•</span>{p}</li>
        ))}
      </ul>
      <span className="mt-auto inline-flex items-center gap-2 font-semibold text-white">
        {cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </span>
    </button>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <header className="flex items-center gap-3 mb-14">
          <img src="/logo.png" alt="" className="h-9 w-9 rounded-lg" />
          <span className="font-bold text-lg tracking-tight">Hazır CV</span>
        </header>
        <div className="mb-10 sm:mb-14">
          <p className="inline-flex items-center gap-2 text-sm text-indigo-300 mb-4"><Sparkles className="h-4 w-4" /> Yapay zeka destekli kariyer asistanı</p>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight max-w-3xl">Bugün ne yapmak istiyorsun?</h1>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <Card
            icon={FileText}
            accent="bg-indigo-500"
            title="İlana göre CV hazırla"
            text="CV'ni ve iş ilanını ver; ilana özel, ATS uyumlu CV'n hazırlansın."
            points={['Eksik ve güçlü yön raporu', 'Uydurma bilgiye karşı doğrulama', 'Mülakat simülasyonu']}
            cta="CV hazırla"
            onClick={() => navigate('/cv')}
          />
          <Card
            icon={Send}
            accent="bg-emerald-500"
            badge="Yeni"
            title="Başvuru otomasyonu oluştur"
            text="Her gün sana uygun ilanları bulan, ön yazını hazırlayan ve senin adına başvuran asistan."
            points={['Rolüne ve şehrine göre günlük tarama', 'İlana özel ön yazı, kendi CV havuzundan', 'Onaylı veya otomatik gönderim']}
            cta="Asistanı kur"
            onClick={() => navigate('/otomasyon')}
          />
        </div>
        <p className="text-xs text-slate-500 mt-10">Tamamen ücretsiz.</p>
      </div>
    </div>
  );
}
