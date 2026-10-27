// Başvuru otomasyonu API istemcisi: her isteğe Supabase oturum anahtarı eklenir.
import { getSession, signOut } from './auth.js';
import { ApiError } from './api.js';

const API_URL = (import.meta.env.VITE_API_URL || 'https://resumatch-backend-zsmt.onrender.com').replace(/\/$/, '');

async function request(path, { method = 'GET', body } = {}) {
  const token = (await getSession())?.access_token;
  if (!token) throw new ApiError('UNAUTHORIZED', 'Oturum bulunamadı. Lütfen tekrar giriş yapın.', { status: 401 });
  let res;
  try {
    res = await fetch(`${API_URL}/api/v1/automation${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('NETWORK', 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.');
  }
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) await signOut();
  if (!res.ok) throw new ApiError(json?.error?.code || `HTTP_${res.status}`, json?.error?.message || `Sunucu hatası (${res.status}).`, { status: res.status });
  return json;
}

export const getMe = () => request('/me');
export const updateMe = (patch) => request('/me', { method: 'PATCH', body: patch });
export const getInbox = () => request('/inbox');
export const markInboxRead = (ids = []) => request('/inbox/read', { method: 'POST', body: { ids } });

export const getSetup = () => request('/setup');
export const uploadCv = (body) => request('/cvs', { method: 'POST', body });
export const updateCv = (id, patch) => request(`/cvs/${id}`, { method: 'PATCH', body: patch });
export const deleteCv = (id) => request(`/cvs/${id}`, { method: 'DELETE' });
export const suggestRoles = (roles) => request('/roles/suggest', { method: 'POST', body: { roles } });
export const saveTargets = (targets) => request('/targets', { method: 'PUT', body: targets });

// Faz 2: Gmail bağlantısı, başvurular, elle tarama
export const getGmail = () => request('/gmail');
export const connectGmail = () => request('/gmail/connect', { method: 'POST' });
export const disconnectGmail = () => request('/gmail', { method: 'DELETE' });
export const listApplications = (status) => request(`/applications${status ? `?status=${status}` : ''}`);
export const updateApplication = (id, patch) => request(`/applications/${id}`, { method: 'PATCH', body: patch });
export const sendApplication = (id) => request(`/applications/${id}/send`, { method: 'POST' });
export const runNow = () => request('/run', { method: 'POST' });

/** Starts today's scan and streams its steps: onEvent({ type: 'progress' | 'result' | 'error', ... }). */
export async function runNowStream(onEvent) {
  const token = (await getSession())?.access_token;
  if (!token) throw new ApiError('UNAUTHORIZED', 'Oturum bulunamadı. Lütfen tekrar giriş yapın.', { status: 401 });
  let res;
  try {
    res = await fetch(`${API_URL}/api/v1/automation/run?stream=1`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new ApiError('NETWORK', 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.');
  }
  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) await signOut();
    throw new ApiError(json?.error?.code || `HTTP_${res.status}`, json?.error?.message || `Sunucu hatası (${res.status}).`, { status: res.status });
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let last = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        const ev = JSON.parse(line);
        if (ev.type === 'ping') continue;
        last = ev;
        onEvent(ev);
      } catch { /* yarım satır */ }
    }
  }
  return last;
}
