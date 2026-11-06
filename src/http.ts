/** Bounded HTTPS JSON transport for read-only provider metadata. */
import { UpdaterError } from './errors.js';
import type { JsonClient } from './types.js';

/** Request limits and injectable transport. A token is sent only to api.github.com. */
export interface JsonClientOptions {
  /** A fixed limit, or a reader evaluated per request so a saved setting applies at once. */
  readonly timeoutMs?: number | (() => number);
  /** A fixed limit, or a reader evaluated per request so a saved setting applies at once. */
  readonly maxBytes?: number | (() => number);
  /** Static token for standalone consumers; ignored when a resolver is supplied. */
  readonly githubToken?: string;
  /** Resolve anew only for the exact GitHub API origin. Absence does not fall back to the static token. */
  readonly resolveGithubToken?: () => Promise<string | undefined>;
  readonly fetch?: typeof globalThis.fetch;
}

/** Bound asynchronous credential resolution by the same cancellation/deadline as the HTTP request. */
async function requestToken(options: JsonClientOptions, signal: AbortSignal): Promise<string | undefined> {
  let value = options.githubToken;
  if (options.resolveGithubToken) {
    let onAbort = () => {};
    try {
      value = await Promise.race([
        Promise.resolve().then(() => { signal.throwIfAborted(); return options.resolveGithubToken!(); }),
        new Promise<never>((_, reject) => {
          onAbort = () => reject(signal.reason);
          signal.addEventListener('abort', onAbort, { once: true });
          if (signal.aborted) onAbort();
        }),
      ]);
    } catch { throw new UpdaterError('error.githubCredentials'); }
    finally { signal.removeEventListener('abort', onAbort); }
  }
  if (value === undefined || value === '') return undefined;
  // GitHub bearer tokens are non-whitespace ASCII; reject malformed values without echoing them.
  if (typeof value !== 'string' || !/^[\x21-\x7e]+$/.test(value)) throw new UpdaterError('error.githubCredentials');
  return value;
}

/** Normalize only valid retry hints; never reflect raw server headers in diagnostics. */
function retryTime(raw: string | null, now: number, relative: boolean): string | undefined {
  if (raw === null) return undefined;
  const value = raw.trim();
  const seconds = /^\d+$/.test(value);
  if (!seconds && (!relative || !/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value))) return undefined;
  const time = seconds ? Number(value) * 1000 + (relative ? now : 0) : Date.parse(value);
  if (!Number.isSafeInteger(time) || time < now || time > 8.64e15) return undefined;
  const date = new Date(time);
  // Date.parse normalizes impossible calendar dates; reject rather than inventing a retry hint.
  if (!seconds && date.toUTCString() !== value) return undefined;
  return date.toISOString();
}

/** Classify HTTP failures from status and safe headers, without reading an untrusted error body. */
function httpError(response: Response, github: boolean): UpdaterError {
  const status = response.status;
  const now = Date.now();
  const retryAfter = retryTime(response.headers.get('retry-after'), now, true);
  const exhausted = response.headers.get('x-ratelimit-remaining')?.trim() === '0';
  if (status === 429 || (github && status === 403 && (exhausted || retryAfter !== undefined))) {
    const retryAt = retryAfter ?? (github && exhausted ? retryTime(response.headers.get('x-ratelimit-reset'), now, false) : undefined);
    if (github) return retryAt === undefined ? new UpdaterError('error.githubRateLimited', { status })
      : new UpdaterError('error.githubRateLimitedUntil', { status, retryAt });
    return retryAt === undefined ? new UpdaterError('error.rateLimited', { status })
      : new UpdaterError('error.rateLimitedUntil', { status, retryAt });
  }
  return new UpdaterError('error.httpStatus', { status });
}

/** Create a JSON client with a deadline covering both headers and streamed body consumption. */
export function createJsonClient(options: JsonClientOptions = {}): JsonClient {
  const transport = options.fetch ?? globalThis.fetch;
  const readLimit = (setting: number | (() => number) | undefined, fallback: number): number =>
    typeof setting === 'function' ? setting() : setting ?? fallback;
  const limits = (): { timeoutMs: number; maxBytes: number } => {
    const timeoutMs = readLimit(options.timeoutMs, 15_000);
    const maxBytes = readLimit(options.maxBytes, 4 * 1024 * 1024);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      throw new UpdaterError('error.requestLimits');
    }
    return { timeoutMs, maxBytes };
  };
  limits();
  return {
    async get(raw, signal) {
      const { timeoutMs, maxBytes } = limits();
      let url: URL;
      try { url = new URL(raw); } catch { throw new UpdaterError('error.requestUrl'); }
      const releasePage = url.origin === 'https://api.github.com'
        && /^\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/releases$/.test(url.pathname)
        && /^\?per_page=100&page=(?:[1-9]|10)$/.test(url.search);
      if (url.protocol !== 'https:' || url.username || url.password || (url.search && !releasePage) || url.hash) throw new UpdaterError('error.requestUrl');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new UpdaterError('error.timeout')), timeoutMs);
      const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      const cancelBody = () => { void reader?.cancel().catch(() => undefined); };
      combined.addEventListener('abort', cancelBody, { once: true });
      try {
        combined.throwIfAborted();
        const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'dsh-better-plugin-updater/0.1.0' };
        if (url.origin === 'https://api.github.com') {
          headers.Accept = 'application/vnd.github+json';
          const token = await requestToken(options, combined);
          if (token) headers.Authorization = `Bearer ${token}`;
        }
        combined.throwIfAborted();
        const response = await transport(url, { headers, redirect: 'error', signal: combined });
        if (!response.ok) {
          // Error bodies can contain credentials, IP addresses or arbitrary remote instructions.
          // Cancelling must not mask the HTTP diagnostic or wait for a stalled error body.
          void response.body?.cancel().catch(() => undefined);
          throw httpError(response, url.origin === 'https://api.github.com');
        }
        if (!response.body) throw new UpdaterError('error.noBody');
        reader = response.body.getReader();
        combined.throwIfAborted();
        const chunks: Uint8Array[] = [];
        let total = 0;
        for (;;) {
          const { done, value } = await reader.read();
          combined.throwIfAborted();
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) throw new UpdaterError('error.bodyLimit');
          chunks.push(value);
        }
        const body = Buffer.concat(chunks, total);
        try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown; }
        catch { throw new UpdaterError('error.invalidJson'); }
      } catch (error) {
        if (combined.aborted) {
          if (controller.signal.aborted && combined.reason === controller.signal.reason) throw new UpdaterError('error.timeout');
          throw new UpdaterError('error.requestCancelled');
        }
        if (error instanceof UpdaterError) throw error;
        throw new UpdaterError('error.requestFailed');
      } finally {
        clearTimeout(timer);
        combined.removeEventListener('abort', cancelBody);
        if (reader) {
          await reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
      }
    },
  };
}
