/**
 * Error raised by third-party providers. `retryable=false` tells the queue not to retry
 * (bad request / auth / invalid number) - retrying those only burns credits and quota.
 */
export class ProviderError extends Error {
  constructor(provider, message, { status, retryable = true, body } = {}) {
    super(`${provider}: ${message}`);
    this.name = 'ProviderError';
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;
    this.body = body;
  }
}

/** 408 / 425 / 429 / 5xx and network errors are transient; other 4xx are permanent. */
export const isRetryableStatus = (status) => !status || status === 408 || status === 425 || status === 429 || status >= 500;

/** fetch with timeout that returns { status, ok, body } (body parsed as JSON when possible). */
export async function request(provider, url, { method = 'POST', headers = {}, json, form, timeoutMs = 10000 } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        accept: 'application/json',
        ...(json ? { 'content-type': 'application/json' } : {}),
        ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        ...headers,
      },
      body: json ? JSON.stringify(json) : form ? new URLSearchParams(form) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? `timed out after ${timeoutMs}ms` : err.message;
    throw new ProviderError(provider, `request failed - ${reason}`, { retryable: true });
  }
  const text = await res.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    /* plain-text response */
  }
  return { status: res.status, ok: res.ok, body };
}
