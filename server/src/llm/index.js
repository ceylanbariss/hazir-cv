import { createGeminiProvider } from './gemini.js';
import { createMockProvider } from './mock.js';

export function createLlm(config) {
  if (config.LLM_PROVIDER === 'mock') return createMockProvider();
  return createGeminiProvider(config);
}
