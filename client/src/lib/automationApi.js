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
