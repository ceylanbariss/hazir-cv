// Günlük özet e-postası: zamanlanmış taramadan sonra kullanıcıya Hazır CV adresinden
// (Resend) "şu başvurular onayını bekliyor, şu ilanlar geldi" e-postası gider.
// Kullanıcının Gmail'i kullanılmaz. Günde en fazla bir kez gider, anlatacak bir şey yoksa gitmez.
import { dayStart } from './worker.js';
import { SOURCE_LABEL } from './alerts.js';

const enc = encodeURIComponent;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const ALERT_MIN_SCORE = 60;

export function buildSummary({ name, pending, alerts, appUrl }) {
  const first = String(name || '').trim().split(/\s+/)[0];
  const panel = `${appUrl}/otomasyon`;
  const parts = [];
  if (pending.length) parts.push(`${pending.length} başvuru onayını bekliyor`);
  if (alerts.length) parts.push(`${alerts.length} yeni ilan`);
  const subject = `Hazır CV · ${parts.join(', ')}`;

  const appLine = (a) => `${a.company}${a.position ? ` · ${a.position}` : ''}${a.score != null ? ` (${a.score} puan)` : ''}`;
  const alertLine = (j) => `${j.title}${j.company ? ` – ${j.company}` : ''}${j.score != null ? ` (${j.score} puan)` : ''}`;

  const text = [
    `Merhaba${first ? ` ${first}` : ''},`,
    '',
    ...(pending.length ? ['Onayını bekleyen başvurular:', ...pending.map((a) => `• ${appLine(a)}`), ''] : []),
    ...(alerts.length ? ['İş alarmlarından gelen uygun ilanlar:', ...alerts.map((j) => `• ${alertLine(j)} – ${j.url}`), ''] : []),
    `Kontrol edip göndermek için: ${panel}`,
    '',
    'Bu özeti Ayarlar sekmesinden kapatabilirsin.',
    'Hazır CV',
  ].join('\n');

  const li = (s) => `<li style="margin:0 0 6px">${s}</li>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;max-width:560px">
<p>Merhaba${first ? ` ${esc(first)}` : ''},</p>
${pending.length ? `<p style="margin:18px 0 6px"><strong>Onayını bekleyen başvurular</strong></p><ul style="padding-left:18px;margin:0">${pending.map((a) => li(esc(appLine(a)))).join('')}</ul>` : ''}
${alerts.length ? `<p style="margin:18px 0 6px"><strong>İş alarmlarından gelen uygun ilanlar</strong></p><ul style="padding-left:18px;margin:0">${alerts.map((j) => li(`<a href="${esc(j.url)}" style="color:#1a1a1a">${esc(alertLine(j))}</a>${j.source ? ` <span style="color:#777">· ${esc(SOURCE_LABEL[j.source] || '')}</span>` : ''}`)).join('')}</ul>` : ''}
<p style="margin:24px 0"><a href="${esc(panel)}" style="background:#1a1a1a;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px;display:inline-block">Panele git</a></p>
<p style="color:#777;font-size:13px">Bu özeti Ayarlar sekmesinden kapatabilirsin.<br>Hazır CV</p>
</div>`;
  return { subject, text, html };
}

/** Returns { sent: boolean, reason? }. Safe to call more than once a day. */
export async function sendDailySummary({ supabase, mailer, config, userId, log, now = new Date() }) {
  if (!mailer) return { sent: false, reason: 'no_mailer' };
  const uid = enc(userId);
  const [profile] = await supabase.select('profiles', `id=eq.${uid}&select=*`);
  if (!profile?.email) return { sent: false, reason: 'no_profile' };
  if (profile.daily_summary === false) return { sent: false, reason: 'disabled' };

  const today = dayStart(now);
  const done = await supabase.select('inbox_items', `user_id=eq.${uid}&kind=eq.daily_summary&created_at=gte.${enc(today)}&select=id`);
  if (done.length) return { sent: false, reason: 'already_sent' };

  const pending = await supabase.select('applications', `user_id=eq.${uid}&status=eq.pending_approval&select=company,position,score&order=score.desc.nullslast&limit=15`);
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const alerts = await supabase.select(
    'alert_jobs',
    `user_id=eq.${uid}&received_at=gte.${enc(since)}&score=gte.${ALERT_MIN_SCORE}&select=title,company,score,url,source&order=score.desc&limit=10`,
  );
  if (!pending.length && !alerts.length) return { sent: false, reason: 'nothing_new' };

  const mail = buildSummary({ name: profile.full_name, pending, alerts, appUrl: config.APP_URL || 'https://hazircv.com.tr' });
  try {
    await mailer.send({ to: profile.email, ...mail });
  } catch (err) {
    log?.warn('summary_send_failed', { userId, error: err.message });
    return { sent: false, reason: 'send_failed' };
  }
  await supabase.insert('inbox_items', [
    { user_id: userId, kind: 'daily_summary', title: mail.subject.replace('Hazır CV · ', 'Günlük özet: '), body: `Özet e-postası ${profile.email} adresine gönderildi.`, data: { pending: pending.length, alerts: alerts.length } },
  ]);
  return { sent: true, pending: pending.length, alerts: alerts.length };
}
