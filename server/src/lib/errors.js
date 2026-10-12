// Typed application errors. `code` is stable and machine-readable (the client
// switches on it); `message` is safe to show to end users.
export class AppError extends Error {
  constructor(code, status, message, details) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const Errors = {
  badRequest: (message, details) => new AppError('BAD_REQUEST', 400, message, details),
  notCv: (message) =>
    new AppError(
      'NOT_A_CV',
      422,
      message || 'Yüklediğiniz doküman bir özgeçmişe (CV) benzemiyor. Lütfen geçerli bir CV yükleyin.',
    ),
  rateLimited: (retryAfterSec) =>
    new AppError(
      'RATE_LIMITED',
      429,
      'Kısa sürede çok fazla istek gönderildi. Lütfen biraz bekleyip tekrar deneyin.',
      { retryAfterSec },
    ),
  busy: () =>
    new AppError('BUSY', 503, 'Sistem şu an yoğun. Lütfen birkaç saniye sonra tekrar deneyin.'),
  budgetExceeded: () =>
    new AppError(
      'DAILY_CAPACITY_REACHED',
      503,
      'Ücretsiz günlük kapasite doldu. Lütfen yarın tekrar deneyin.',
    ),
  upstream: (message = 'Yapay zeka servisine şu an ulaşılamıyor. Lütfen tekrar deneyin.', details) =>
    new AppError('UPSTREAM_ERROR', 502, message, details),
  invalidModelOutput: (details) =>
    new AppError(
      'INVALID_MODEL_OUTPUT',
      502,
      'Yapay zeka beklenen formatta yanıt üretemedi. Lütfen tekrar deneyin.',
      details,
    ),
  forbiddenOrigin: () => new AppError('FORBIDDEN_ORIGIN', 403, 'Bu kaynaktan erişime izin verilmiyor.'),
  notFound: () => new AppError('NOT_FOUND', 404, 'Bulunamadı.'),
};
