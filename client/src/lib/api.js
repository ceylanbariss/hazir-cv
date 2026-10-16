// Typed client for the Hazır CV v3 API. All prompts live on the server; the
// browser only sends user data and receives validated, structured results.
const API_URL = (import.meta.env.VITE_API_URL || 'https://resumatch-backend-zsmt.onrender.com').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(code, message, { status, retryAfterSec, requestId } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryAfterSec = retryAfterSec;
    this.requestId = requestId;
  }
}

const NETWORK_MSG = 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function toApiError(res) {
  const body = await res.json().catch(() => ({}));
  return new ApiError(body?.error?.code || 'HTTP_' + res.status, body?.error?.message || `Sunucu hatası (${res.status}).`, {
    status: res.status,
    retryAfterSec: body?.error?.retryAfterSec,
    requestId: body?.requestId,
  });
}

/** JSON POST with timeout; retries once only on transient capacity errors. */
async function post(path, body, { timeoutMs = 90_000, retries = 1 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(API_URL + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (res.ok) return await res.json();
      const err = await toApiError(res);
      if ((err.code === 'BUSY' || err.code === 'UPSTREAM_ERROR') && attempt < retries) {
        await sleep(2000);
        continue;
      }
      throw err;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      if (attempt < retries) {
        await sleep(1500);
        continue;
      }
      throw new ApiError(e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK', e.name === 'AbortError' ? 'İstek zaman aşımına uğradı. Lütfen tekrar deneyin.' : NETWORK_MSG);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Wake the (free-tier) API server early so the first real request is fast. */
export function warmUp() {
  fetch(API_URL + '/api/v1/health').catch(() => {});
}

/**
 * Runs the tailoring pipeline and streams real progress.
 * @param {{cv:string, jobPosting:string, lang:'tr'|'en'}} input
 * @param {{onStage?:(e:{name:string,status:'start'|'done',ms?:number})=>void, signal?:AbortSignal}} opts
 */
export async function tailorCv(input, { onStage = () => {}, signal } = {}) {
  let res;
  try {
    res = await fetch(API_URL + '/api/v1/tailor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(input),
      signal,
    });
  } catch {
    throw new ApiError('NETWORK', NETWORK_MSG);
  }
  if (!res.ok) throw await toApiError(res);
  if (!(res.headers.get('content-type') || '').includes('text/event-stream')) return res.json();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const event = chunk.match(/^event: (.+)$/m)?.[1];
      const data = chunk.match(/^data: (.+)$/m)?.[1];
      if (!event || !data) continue; // heartbeat comments
      const payload = JSON.parse(data);
      if (event === 'stage') onStage(payload);
      if (event === 'result') return payload;
      if (event === 'error') {
        throw new ApiError(payload.error?.code || 'ERROR', payload.error?.message || 'Bir hata oluştu.', { requestId: payload.requestId });
      }
    }
  }
  throw new ApiError('STREAM_ENDED', 'Bağlantı beklenmedik şekilde kapandı. Lütfen tekrar deneyin.');
}

export const interviewTurn = (body) => post('/api/v1/interview/turn', body, { timeoutMs: 45_000 });
export const interviewReport = (body) => post('/api/v1/interview/report', body);
export const addItem = (body) => post('/api/v1/assist/add-item', body, { timeoutMs: 45_000 });
export const integrateGaps = (body) => post('/api/v1/assist/integrate-gaps', body, { timeoutMs: 45_000 });
export const ocrJobPosting = (images) => post('/api/v1/ocr', { images }, { timeoutMs: 90_000 });
