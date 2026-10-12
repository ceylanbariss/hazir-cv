// Entry point (kept at this path so existing hosting start commands keep working).
import 'dotenv/config';
import { loadConfig } from './src/config.js';
import { createLogger } from './src/lib/logger.js';
import { createLlm } from './src/llm/index.js';
import { createApp } from './src/app.js';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const llm = createLlm(config);
const app = createApp({ config, llm, logger });

const server = app.listen(config.PORT, () => {
  logger.info('server_started', { port: config.PORT, provider: llm.name, model: llm.model, env: config.NODE_ENV });
});

// SSE pipelines can take ~30s; allow in-flight requests to finish on redeploys.
const shutdown = (signal) => {
  logger.info('shutdown', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 35_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
