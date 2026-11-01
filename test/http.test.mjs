import test from 'node:test';
import assert from 'node:assert/strict';
import { createJsonClient } from '../dist/core.js';
import { UpdaterError } from '../dist/errors.js';

const github = 'https://api.github.com/repos/owner/repo';
const future = '2099-01-01T00:00:00.000Z';
const reset = String(Date.parse(future) / 1000);
const futureDate = new Date(future).toUTCString();
function diagnostic(key, params) {
  return error => {
    assert.ok(error instanceof UpdaterError);
    assert.deepEqual(error.detail, { key, ...(params === undefined ? {} : { params }) });
    return true;
  };
}
function rejecting(status, headers = {}, body = 'fixture-secret') {
  return createJsonClient({ fetch: async () => new Response(body, { status, headers }) });
}

test('JSON transport never leaks the GitHub token to a registry', async () => {
  const requests = [];
  const client = createJsonClient({ githubToken: 'fixture-secret', fetch: async (url, init) => {
    requests.push({ url: String(url), init }); return Response.json({ ok: true });
  } });
  assert.deepEqual(await client.get(github), { ok: true });
  await client.get('https://registry.test/plugin');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer fixture-secret');
  assert.equal(requests[1].init.headers.Authorization, undefined);
  assert.equal(requests[0].init.redirect, 'error');
});

test('dynamic credentials are resolved per GitHub request and never read or sent to other origins', async () => {
  let resolutions = 0;
  let token = 'fixture-first-token';
  const sent = [];
  const client = createJsonClient({
    githubToken: 'fixture-static-must-not-win',
    resolveGithubToken: async () => { resolutions++; return token; },
    fetch: async (url, init) => { sent.push({ url: String(url), authorization: init.headers.Authorization }); return Response.json({}); },
  });
  for (const url of ['https://registry.test/plugin', 'https://api.github.com.example.test/plugin', 'https://api.github.com:444/plugin']) await client.get(url);
  assert.equal(resolutions, 0);
  assert.ok(sent.every(request => request.authorization === undefined));
  await client.get(github);
  assert.equal(sent.at(-1).authorization, 'Bearer fixture-first-token');
  token = 'fixture-rotated-token';
  await client.get(github);
  assert.equal(sent.at(-1).authorization, 'Bearer fixture-rotated-token');
  token = undefined;
  await client.get(github);
  assert.equal(sent.at(-1).authorization, undefined);
  assert.equal(resolutions, 3);
});

test('credential failures and malformed tokens send no request and reveal no secret', async () => {
  let requests = 0;
  const transport = async () => { requests++; return Response.json({}); };
  const failing = createJsonClient({ resolveGithubToken: async () => { throw new Error('fixture-secret'); }, fetch: transport });
  await assert.rejects(failing.get(github), diagnostic('error.githubCredentials'));
  for (const token of ['fixture-secret\r\nInjected: value', 'fixture secret', '含有机密', 123]) {
    await assert.rejects(createJsonClient({ resolveGithubToken: async () => token, fetch: transport }).get(github), diagnostic('error.githubCredentials'));
  }
  assert.equal(requests, 0);
  // A broken GitHub credential provider must not break or get invoked by npm checks.
  await failing.get('https://registry.test/plugin');
  assert.equal(requests, 1);
});

test('credential resolution obeys timeout and caller cancellation without late requests', async () => {
  let requests = 0;
  let lateReject;
  const never = new Promise((_, reject) => { lateReject = reject; });
  const transport = async () => { requests++; return Response.json({}); };
  await assert.rejects(createJsonClient({ timeoutMs: 20, resolveGithubToken: () => never, fetch: transport }).get(github), diagnostic('error.timeout'));
  lateReject(new Error('fixture-secret late rejection'));

  const controller = new AbortController();
  let finish;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const client = createJsonClient({ resolveGithubToken: () => { entered(); return new Promise(resolve => { finish = resolve; }); }, fetch: transport });
  const pending = client.get(github, controller.signal);
  const rejected = assert.rejects(pending, diagnostic('error.requestCancelled'));
  await started;
  controller.abort(new Error('fixture-secret abort reason'));
  await rejected;
  finish('fixture-late-token');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests, 0);
});

test('unsafe metadata URLs are refused before network access', async () => {
  let requests = 0;
  const client = createJsonClient({ fetch: async () => { requests++; return Response.json({}); } });
  for (const url of ['http://example.test', 'file:///etc/passwd', 'https://user:secret@example.test', 'https://example.test/?token=secret', 'https://example.test/#x']) {
    await assert.rejects(client.get(url), diagnostic('error.requestUrl'));
  }
  assert.equal(requests, 0);
});

test('body bounds, missing bodies and invalid UTF-8/JSON keep their specific diagnostics', async () => {
  await assert.rejects(createJsonClient({ maxBytes: 4, fetch: async () => new Response('123456') }).get('https://example.test/'), diagnostic('error.bodyLimit'));
  await assert.rejects(createJsonClient({ fetch: async () => new Response(new Uint8Array([255])) }).get('https://example.test/'), diagnostic('error.invalidJson'));
  await assert.rejects(createJsonClient({ fetch: async () => new Response('not json') }).get('https://example.test/'), diagnostic('error.invalidJson'));
  await assert.rejects(createJsonClient({ fetch: async () => new Response(null, { status: 204 }) }).get('https://example.test/'), diagnostic('error.noBody'));
});

test('ordinary HTTP failures retain their numeric status without exposing response bodies', async () => {
  for (const status of [401, 403, 404, 500, 503]) {
    await assert.rejects(rejecting(status).get(github), error => {
      diagnostic('error.httpStatus', { status })(error);
      assert.match(error.message, new RegExp(`HTTP ${status}`));
      assert.doesNotMatch(error.message, /fixture-secret|owner\/repo/);
      return true;
    });
  }
});

test('GitHub exhausted primary quota reports the status, validated reset time and token hint', async () => {
  await assert.rejects(rejecting(403, { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': reset }).get(github), error => {
    diagnostic('error.githubRateLimitedUntil', { status: 403, retryAt: future })(error);
    assert.match(error.message, /GitHub API rate limit.*HTTP 403/);
    assert.match(error.message, /DSH credentials/);
    assert.ok(error.message.includes(future));
    assert.doesNotMatch(error.message, /fixture-secret/);
    return true;
  });
});

test('GitHub rate limits without a usable retry time remain explicit and never echo raw headers', async () => {
  for (const value of ['', 'fixture-secret', '-1', '1.5', '0', '1', 'Infinity', '999999999999999999999999']) {
    await assert.rejects(rejecting(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': value, 'retry-after': value === '0' || value === '1' ? 'invalid' : value }).get(github),
      diagnostic('error.githubRateLimited', { status: 403 }));
  }
  await assert.rejects(rejecting(429).get(github), diagnostic('error.githubRateLimited', { status: 429 }));
});

test('GitHub secondary limits accept Retry-After dates without assuming the primary reset', async () => {
  await assert.rejects(rejecting(403, { 'x-ratelimit-remaining': '15', 'retry-after': futureDate, 'x-ratelimit-reset': String(Number(reset) + 3600) }).get(github),
    diagnostic('error.githubRateLimitedUntil', { status: 403, retryAt: future }));
  // Retry-After takes priority even when the exhausted primary quota resets later.
  await assert.rejects(rejecting(429, { 'x-ratelimit-remaining': '0', 'retry-after': futureDate, 'x-ratelimit-reset': String(Number(reset) + 3600) }).get(github),
    diagnostic('error.githubRateLimitedUntil', { status: 429, retryAt: future }));
  await assert.rejects(rejecting(403, { 'x-ratelimit-remaining': '0', 'retry-after': 'invalid', 'x-ratelimit-reset': reset }).get(github),
    diagnostic('error.githubRateLimitedUntil', { status: 403, retryAt: future }));
});

test('Retry-After delay seconds are normalized to UTC and do not trigger automatic retries', async () => {
  let requests = 0;
  const client = createJsonClient({ fetch: async () => { requests++; return new Response(null, { status: 429, headers: { 'Retry-After': '120' } }); } });
  const before = Date.now();
  await assert.rejects(client.get(github), error => {
    assert.equal(error.detail.key, 'error.githubRateLimitedUntil');
    assert.equal(error.detail.params.status, 429);
    const retry = Date.parse(error.detail.params.retryAt);
    assert.ok(retry >= before + 120000 && retry <= Date.now() + 120000);
    assert.match(error.detail.params.retryAt, /Z$/);
    return true;
  });
  assert.equal(requests, 1);
});

test('unrelated forbidden responses and non-GitHub headers are not mistaken for GitHub limits', async () => {
  for (const headers of [{}, { 'x-ratelimit-remaining': '15', 'x-ratelimit-reset': reset }, { 'retry-after': 'fixture-secret' }, { 'retry-after': '-1' }]) {
    await assert.rejects(rejecting(403, headers).get(github), diagnostic('error.httpStatus', { status: 403 }));
  }
  for (const url of ['https://registry.test/plugin', 'https://api.github.com.example.test/plugin', 'https://api.github.com:444/plugin']) {
    await assert.rejects(rejecting(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset, 'retry-after': futureDate }).get(url),
      diagnostic('error.httpStatus', { status: 403 }));
  }
});

test('generic HTTP 429 reports rate limiting, using only a valid Retry-After hint', async () => {
  await assert.rejects(rejecting(429, { 'retry-after': futureDate }).get('https://registry.test/plugin'),
    diagnostic('error.rateLimitedUntil', { status: 429, retryAt: future }));
  for (const headers of [{}, { 'retry-after': 'fixture-secret' }, { 'retry-after': '0.5' }, { 'retry-after': '999999999999999999' }, { 'retry-after': 'Thu, 01 Jan 1970 00:00:00 GMT' }, { 'retry-after': 'Tue, 31 Feb 2099 00:00:00 GMT' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset }]) {
    await assert.rejects(rejecting(429, headers).get('https://registry.test/plugin'), diagnostic('error.rateLimited', { status: 429 }));
  }
});

test('error bodies are cancelled without being read and cancellation failures cannot mask HTTP errors', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; throw new Error('fixture-secret'); } });
  const client = createJsonClient({ fetch: async () => new Response(stream, { status: 404 }) });
  await assert.rejects(client.get(github), diagnostic('error.httpStatus', { status: 404 }));
  assert.equal(cancelled, true);
  const stalled = new ReadableStream({ cancel() { return new Promise(() => {}); } });
  await assert.rejects(createJsonClient({ fetch: async () => new Response(stalled, { status: 503 }) }).get(github), diagnostic('error.httpStatus', { status: 503 }));
});

test('a stalled response body reports timeout and is cancelled at the request deadline', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const client = createJsonClient({ timeoutMs: 20, fetch: async () => new Response(stream) });
  await assert.rejects(client.get('https://example.test/'), diagnostic('error.timeout'));
  assert.equal(cancelled, true);
});

test('caller cancellation is distinct from timeout and never exposes its arbitrary reason', async () => {
  const controller = new AbortController(); controller.abort(new Error('fixture-secret'));
  let called = false;
  const client = createJsonClient({ fetch: async () => { called = true; return Response.json({}); } });
  await assert.rejects(client.get('https://example.test/', controller.signal), diagnostic('error.requestCancelled'));
  assert.equal(called, false);
  assert.throws(() => createJsonClient({ maxBytes: 0 }), diagnostic('error.requestLimits'));

  const duringHeaders = new AbortController();
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const aborting = createJsonClient({ fetch: async () => { duringHeaders.abort(new Error('fixture-secret')); return new Response(stream); } });
  await assert.rejects(aborting.get(github, duringHeaders.signal), diagnostic('error.requestCancelled'));
  assert.equal(cancelled, true);
});

test('network and body transport failures remain sanitized generic transport errors', async () => {
  const client = createJsonClient({ fetch: async () => { throw new Error('fixture-secret https://user:pass@example.test/'); } });
  await assert.rejects(client.get(github), diagnostic('error.requestFailed'));
  const body = new ReadableStream({ start(controller) { controller.error(new Error('fixture-secret')); } });
  await assert.rejects(createJsonClient({ fetch: async () => new Response(body) }).get(github), diagnostic('error.requestFailed'));
});
