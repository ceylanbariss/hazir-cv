// Günlük özet e-postası: zamanlanmış taramadan sonra kullanıcıya Hazır CV adresinden
// (Resend) "şu başvurular onayını bekliyor, şu ilanlar geldi" e-postası gider.
// Kullanıcının Gmail'i kullanılmaz. Günün ilk zamanlanmış taramasından sonra her durumda gider; aynı gün
// sonraki taramalardan sonra yalnızca yeni başvuru taslağı ya da yeni alarm ilanı varsa tekrar gider.
import { dayStart } from './worker.js';
import { SOURCE_LABEL } from './alerts.js';

const enc = encodeURIComponent;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const ALERT_MIN_SCORE = 60; // bu puan ve üstü "uygun", altı "diğer" başlığında listelenir
const ALERT_LIMIT = 40;

const TOP_LIMIT = 6; // e-postada kart olarak gösterilen en uygun ilan sayısı
const REST_LIMIT = 8; // "diğer ilanlar" listesinde gösterilen en fazla ilan

/** "Barış Ceylan" → "Barış"; boşsa null. */
export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || null;
const plural = (n, word) => `${n} ${word}`; // Türkçede sayıdan sonra tekil kalır

/**
 * Konu satırı ve ön izleme metni: e-posta açılmadan bildirimde görünen kısım.
 * Kişinin adıyla başlar ve en önemli haberi tek cümlede söyler.
 */
export function summaryHeadline({ name, pending, good, rest }) {
  const n = firstName(name);
  // Cümleler küçük harfle yazılır; ad varsa başına eklenir, yoksa ilk harf büyütülür.
  const hi = (s) => (n ? `${n}, ${s}` : s[0].toLocaleUpperCase('tr') + s.slice(1));
  const top = good[0];
  const topLine = top ? `${top.title}${top.company ? ` – ${top.company}` : ''}${top.score != null ? ` (${top.score} puan)` : ''}` : '';
  let subject;
  if (pending.length && good.length) subject = hi(`${plural(pending.length, 'başvurun')} onay bekliyor, ${plural(good.length, 'yeni ilan')} da sana çok uygun`);
  else if (pending.length) subject = hi(`${plural(pending.length, 'başvurun')} hazır, göndermek için onayını bekliyor`);
  else if (good.length) subject = hi(`sana uygun ${plural(good.length, 'yeni ilan')} buldum${top.company && top.score != null ? `, en iyisi ${top.company} (${top.score} puan)` : ''} 🎯`);
  else if (rest.length) subject = hi(`${plural(rest.length, 'yeni ilan')} geldi, ama hiçbiri tam sana göre değil`);
  else subject = hi('bugün sana uygun yeni ilan çıkmadı');

  let preview;
  if (pending.length) preview = `${pending[0].company}${pending[0].position ? ` · ${pending[0].position}` : ''} için ön yazın hazır. Kontrol et, tek dokunuşla gönder.`;
  else if (top) {
    const others = good.slice(1, 3).map((j) => j.company || j.title);
    const also = !others.length ? '' : good.length > 3 ? `${others.join(', ')} ve dahası` : others.join(' ve ');
    preview = `En uygunu: ${topLine}.${also ? ` Ayrıca ${also}.` : ''}`;
  }
  else if (rest.length) preview = 'Gelen ilanları CV\'ne göre puanladım; hiçbiri hedeflerine yeterince yakın değil.';
  else preview = 'Taramaya devam ediyorum. Yeni bir şey çıkınca ilk sen öğreneceksin.';
  return { subject, preview };
}

export function buildSummary({ name, pending, alerts, appUrl, stats }) {
  const first = firstName(name);
  const panel = `${appUrl}/otomasyon`;
  const good = alerts.filter((j) => (j.score ?? 0) >= ALERT_MIN_SCORE);
  const rest = alerts.filter((j) => (j.score ?? 0) < ALERT_MIN_SCORE);
  const { subject, preview } = summaryHeadline({ name, pending, good, rest });
  const topJobs = good.slice(0, TOP_LIMIT);
  const moreGood = good.length - topJobs.length;
  const restJobs = rest.slice(0, REST_LIMIT);
  const moreRest = rest.length - restJobs.length;
  const nothing = !pending.length && !alerts.length;
  const statLine = stats
    ? `Bugün senin için ${stats.searches || 0} arama yaptım, ${stats.pages || 0} şirket sayfasını inceledim${stats.drafted ? ` ve ${stats.drafted} başvuru hazırladım` : ''}.`
    : '';
  const where = (j) => [j.company, j.location, SOURCE_LABEL[j.source]].filter(Boolean).join(' · ');
  const intro = pending.length || good.length
    ? 'Senin için ilanlara baktım, kaçırmaman gerekenler aşağıda.'
    : nothing
      ? 'Bugün sana uygun yeni bir ilan çıkmadı. Taramaya devam ediyorum; bir şey bulunca hemen haber vereceğim.'
      : 'Yeni ilanlar geldi ama hiçbiri hedeflerine tam uymuyor. Yine de göz atmak istersen aşağıda.';

  // ---- Düz metin ----
  const text = [
    `Merhaba${first ? ` ${first}` : ''},`,
    '',
    intro,
    '',
    ...(pending.length
      ? [`GÖNDERİLMEYİ BEKLEYEN ${plural(pending.length, 'BAŞVURU')}`, ...pending.map((a) => `• ${a.company}${a.position ? ` · ${a.position}` : ''}${a.score != null ? ` (${a.score} puan)` : ''}`), `Kontrol edip göndermek için: ${panel}`, '']
      : []),
    ...(topJobs.length
      ? ['SANA EN UYGUN İLANLAR', ...topJobs.flatMap((j) => [`• ${j.title}${j.company ? ` – ${j.company}` : ''}${j.score != null ? ` (${j.score} puan)` : ''}`, ...(j.reason ? [`  ${j.reason}`] : []), `  ${j.url}`]), ...(moreGood > 0 ? [`…ve ${moreGood} uygun ilan daha panelde.`] : []), '']
      : []),
    ...(restJobs.length
      ? ['DİĞER İLANLAR (puanı düşük kalanlar)', ...restJobs.map((j) => `• ${j.title}${j.company ? ` – ${j.company}` : ''}${j.score != null ? ` (${j.score} puan)` : ''} – ${j.url}`), ...(moreRest > 0 ? [`…ve ${moreRest} ilan daha panelde.`] : []), '']
      : []),
    ...(statLine ? [statLine, ''] : []),
    `Tüm ilanlar ve başvuruların: ${panel}`,
    '',
    'Bu e-postayı panelde Ayarlar bölümünden kapatabilirsin.',
    'Hazır CV',
  ].join('\n');

  // ---- HTML (e-posta istemcileri için satır içi stiller) ----
  const F = "font-family:Arial,Helvetica,sans-serif";
  const btn = (href, label, dark = true) =>
    `<a href="${esc(href)}" style="display:inline-block;${F};font-size:15px;font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:8px;${dark ? 'background:#0a0a0a;color:#ffffff' : 'background:#ffffff;color:#0a0a0a;border:1.5px solid #0a0a0a'}">${esc(label)}</a>`;
  const scoreBadge = (sc) =>
    sc == null ? '' : `<td width="64" valign="top" style="padding:0 14px 0 0"><div style="${F};width:56px;height:56px;line-height:56px;text-align:center;border-radius:12px;background:${sc >= 80 ? '#10b981' : '#d1fae5'};color:${sc >= 80 ? '#ffffff' : '#047857'};font-size:22px;font-weight:bold">${sc}</div></td>`;
  const jobCard = (j) => `<tr><td style="padding:0 0 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;background:#ffffff"><tr><td style="padding:16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
${scoreBadge(j.score)}<td valign="top">
<div style="${F};font-size:17px;font-weight:bold;color:#0a0a0a;line-height:1.3">${esc(j.title)}</div>
<div style="${F};font-size:14px;color:#64748b;margin-top:4px">${esc(where(j))}</div>
${j.reason ? `<div style="${F};font-size:14px;color:#334155;margin-top:8px;line-height:1.45">${esc(j.reason)}</div>` : ''}
<div style="margin-top:12px"><a href="${esc(j.url)}" style="${F};font-size:14px;font-weight:bold;color:#047857;text-decoration:none">İlana git →</a></div>
</td></tr></table></td></tr></table></td></tr>`;
  const section = (title, sub, body) => `<tr><td style="padding:22px 0 10px"><div style="${F};font-size:13px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;color:#64748b">${esc(title)}</div>${sub ? `<div style="${F};font-size:14px;color:#64748b;margin-top:4px">${esc(sub)}</div>` : ''}</td></tr>${body}`;

  const pendingBox = pending.length
    ? `<tr><td style="padding:8px 0 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;border-radius:14px"><tr><td style="padding:20px">
<div style="${F};font-size:13px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;color:#6ee7b7">Onayını bekliyor</div>
<div style="${F};font-size:20px;font-weight:bold;color:#ffffff;margin-top:6px;line-height:1.3">${plural(pending.length, 'başvurun')} hazır, sadece gönder demen gerekiyor</div>
<ul style="${F};font-size:15px;color:#e2e8f0;padding-left:18px;margin:12px 0 16px;line-height:1.6">${pending.map((a) => `<li>${esc(a.company)}${a.position ? ` · ${esc(a.position)}` : ''}${a.score != null ? ` <span style="color:#6ee7b7">(${a.score} puan)</span>` : ''}</li>`).join('')}</ul>
<a href="${esc(panel)}" style="display:inline-block;${F};font-size:15px;font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:8px;background:#ffffff;color:#0a0a0a">Kontrol et ve gönder</a>
</td></tr></table></td></tr>`
    : '';
  const topBlock = topJobs.length
    ? section('Sana en uygun ilanlar', 'CV\'ne göre puanladım; puan ne kadar yüksekse o kadar uygun.', topJobs.map(jobCard).join('') + (moreGood > 0 ? `<tr><td style="${F};font-size:14px;color:#64748b;padding:2px 0 0">…ve ${moreGood} uygun ilan daha panelde.</td></tr>` : ''))
    : '';
  const restBlock = restJobs.length
    ? section('Diğer ilanlar', 'Bunlar rolüne, kıdemine ya da şehrine pek uymuyor.', `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${restJobs.map((j) => `<tr><td style="${F};font-size:14px;padding:7px 0;border-bottom:1px solid #f1f5f9"><a href="${esc(j.url)}" style="color:#0a0a0a;text-decoration:none">${esc(j.title)}</a><span style="color:#64748b">${j.company ? ` · ${esc(j.company)}` : ''}</span></td><td align="right" style="${F};font-size:13px;color:#64748b;padding:7px 0 7px 10px;border-bottom:1px solid #f1f5f9;white-space:nowrap">${j.score != null ? `${j.score} puan` : ''}</td></tr>`).join('')}</table></td></tr>` + (moreRest > 0 ? `<tr><td style="${F};font-size:14px;color:#64748b;padding:8px 0 0">…ve ${moreRest} ilan daha panelde.</td></tr>` : ''))
    : '';
  // Gizli ön izleme metni: Gmail ve telefon bildirimleri konu satırının yanında bunu gösterir.
  const previewHtml = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preview)}${'&#8204;&nbsp;'.repeat(60)}</div>`;
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9">${previewHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 0 16px;${F};font-size:15px;font-weight:bold;color:#0a0a0a">Hazır CV</td></tr>
<tr><td style="background:#ffffff;border-radius:16px;padding:24px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="${F};font-size:24px;font-weight:bold;color:#0a0a0a;line-height:1.25">Merhaba${first ? ` ${esc(first)}` : ''} 👋</td></tr>
<tr><td style="${F};font-size:16px;color:#334155;line-height:1.5;padding:8px 0 4px">${esc(intro)}</td></tr>
${pendingBox}${topBlock}${restBlock}
${statLine ? `<tr><td style="${F};font-size:14px;color:#64748b;padding:20px 0 0;line-height:1.5">${esc(statLine)}</td></tr>` : ''}
<tr><td style="padding:22px 0 0">${btn(panel, 'Panelde tümünü gör')}</td></tr>
</table></td></tr>
<tr><td style="${F};font-size:12px;color:#94a3b8;padding:16px 4px;line-height:1.5">Bu e-postayı panelde Ayarlar bölümünden kapatabilirsin. LinkedIn ve Kariyer.net ilanlarına başvuruyu sen yaparsın; asistan bu sitelere otomatik başvurmaz.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, preview, text, html };
}

/** Returns { sent: boolean, reason? }. Safe to call more than once a day. */
export async function sendDailySummary({ supabase, mailer, config, userId, log, stats, now = new Date() }) {
  if (!mailer) return { sent: false, reason: 'no_mailer' };
  const uid = enc(userId);
  const [profile] = await supabase.select('profiles', `id=eq.${uid}&select=*`);
  if (!profile?.email) return { sent: false, reason: 'no_profile' };
  if (profile.daily_summary === false) return { sent: false, reason: 'disabled' };

  const today = dayStart(now);
  const done = (await supabase.select('inbox_items', `user_id=eq.${uid}&kind=eq.daily_summary&created_at=gte.${enc(today)}&select=id,created_at&order=created_at.desc`))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const last = done[0]?.created_at;

  const pending = await supabase.select('applications', `user_id=eq.${uid}&status=eq.pending_approval&select=company,position,score&order=score.desc.nullslast&limit=15`);
  // Bugün zaten özet gittiyse yalnızca o özetten sonra gelen ilanlar listelenir (aynı ilan iki kez gelmesin).
  const since = last || new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const alertQ = `user_id=eq.${uid}&received_at=gte.${enc(since)}&select=title,company,location,reason,score,url,source&order=score.desc.nullslast&limit=${ALERT_LIMIT}`;
  // Başvuruya kapandığı anlaşılan ilanlar özete girmez (durum sütunu yoksa hepsi listelenir).
  const alerts = await supabase
    .select('alert_jobs', `${alertQ}&or=(status.is.null,status.neq.closed)`)
    .catch(() => supabase.select('alert_jobs', alertQ));
  if (last && !(stats?.drafted > 0) && !alerts.length) return { sent: false, reason: 'already_sent' };
  // İlk zamanlanmış taramadan sonra (stats var) yeni bir şey olmasa da kısa bir özet gider; elle çağrıda gitmez.
  if (!pending.length && !alerts.length && !stats) return { sent: false, reason: 'nothing_new' };

  const mail = buildSummary({ name: profile.full_name, pending, alerts, stats, appUrl: config.APP_URL || 'https://hazircv.com.tr' });
  try {
    await mailer.send({ to: profile.email, ...mail });
  } catch (err) {
    log?.warn('summary_send_failed', { userId, error: err.message });
    return { sent: false, reason: 'send_failed' };
  }
  await supabase.insert('inbox_items', [
    { user_id: userId, kind: 'daily_summary', title: `Özet e-postası: ${mail.subject}`, body: `Özet e-postası ${profile.email} adresine gönderildi.`, data: { pending: pending.length, alerts: alerts.length } },
  ]);
  return { sent: true, pending: pending.length, alerts: alerts.length };
}
