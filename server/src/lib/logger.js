// Minimal structured (JSON-lines) logger. Deliberately never receives CV or
// job-posting text: callers log sizes, ids and timings only (KVKK / privacy).
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

export function createLogger(level = 'info', sink = (line) => process.stdout.write(line + '\n')) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const emit = (lvl, msg, fields) => {
    if (LEVELS[lvl] < threshold) return;
    sink(JSON.stringify({ t: new Date().toISOString(), level: lvl, msg, ...fields }));
  };
  const make = (base) => ({
    debug: (msg, f) => emit('debug', msg, { ...base, ...f }),
    info: (msg, f) => emit('info', msg, { ...base, ...f }),
    warn: (msg, f) => emit('warn', msg, { ...base, ...f }),
    error: (msg, f) => emit('error', msg, { ...base, ...f }),
    child: (extra) => make({ ...base, ...extra }),
  });
  return make({});
}
