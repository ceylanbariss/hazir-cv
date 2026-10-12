// HTTP plumbing: request ids, security headers, CORS policy, error mapping, SSE.
import { randomUUID } from 'node:crypto';
import { AppError, Errors } from './errors.js';

export function requestContext(logger) {
  return (req, res, next) => {
    const incoming = req.get('x-request-id');
    req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', req.id);
    req.log = logger.child({ reqId: req.id });
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      req.log.info('http', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Math.round(ms),
        reqBytes: Number(req.get('content-length') || 0),
      });
    });
    next();
  };
}

export function securityHeaders() {
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.removeHeader('X-Powered-By');
    next();
  };
}

export function isOriginAllowed(origin, config) {
  if (!origin) return true; // curl, server-to-server, health checks
  return config.ALLOWED_ORIGINS.includes(origin) || config.originPattern.test(origin);
}

export function corsOptions(config) {
  return {
    origin(origin, cb) {
      if (isOriginAllowed(origin, config)) return cb(null, true);
      cb(Errors.forbiddenOrigin());
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After', 'RateLimit-Remaining'],
    maxAge: 600,
  };
}

export function errorHandler() {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, _next) => {
    let appErr = err;
    if (err?.type === 'entity.too.large') {
      appErr = new AppError('PAYLOAD_TOO_LARGE', 413, 'Gönderilen veri çok büyük.');
    } else if (err?.type === 'entity.parse.failed') {
      appErr = Errors.badRequest('Geçersiz JSON gövdesi.');
    } else if (!(err instanceof AppError)) {
      req.log?.error('unhandled_error', { err: err?.message, stack: err?.stack?.split('\n').slice(0, 4).join(' | ') });
      appErr = new AppError('INTERNAL', 500, 'Beklenmeyen bir hata oluştu.');
    } else if (appErr.status >= 500) {
      req.log?.warn('app_error', { code: appErr.code, details: appErr.details });
    }
    if (res.headersSent) {
      // Streaming response already started: report via the stream instead.
      if (res.sse) res.sse.send('error', toBody(appErr, req));
      return res.end();
    }
    res.status(appErr.status).json(toBody(appErr, req));
  };
}

export const toBody = (appErr, req) => ({
  error: { code: appErr.code, message: appErr.message, ...(appErr.details?.retryAfterSec ? { retryAfterSec: appErr.details.retryAfterSec } : {}) },
  requestId: req.id,
});

/** Server-Sent Events helper over a POST response (client reads via fetch streams). */
export function openSse(res) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
  heartbeat.unref?.();
  res.on('close', () => clearInterval(heartbeat));
  const sse = {
    send(event, data) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      clearInterval(heartbeat);
      res.end();
    },
  };
  res.sse = sse;
  return sse;
}

export const wantsSse = (req) => (req.get('accept') || '').includes('text/event-stream');
