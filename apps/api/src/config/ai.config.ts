const parsedTimeout = Number(process.env.AI_SERVICE_TIMEOUT_MS ?? 35000);

export const aiConfig = {
  serviceUrl: process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000',
  timeoutMs: Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 35000,
};
