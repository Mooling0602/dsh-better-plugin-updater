import test from 'node:test';
import assert from 'node:assert/strict';
import { Config } from '../dist/config.js';
import { en, zh } from '../dist/client/locales.js';

test('serialized configuration describes fields and choices in English and Chinese', () => {
  const { uid, refs } = Config.toJSON();
  const node = id => refs[id];
  const fields = node(uid).dict;
  const assertLocalized = id => {
    const description = node(id).meta.description;
    assert.ok(description?.[''], `missing English description for ${id}`);
    assert.ok(description?.zh, `missing Chinese description for ${id}`);
  };

  assert.deepEqual(Object.keys(fields).sort(), ['githubTokenEnv', 'indexes', 'language', 'maxMetadataBytes', 'planTtlMs', 'requestTimeoutMs', 'sources']);
  for (const id of Object.values(fields)) assertLocalized(id);
  const language = node(fields.language);
  assert.equal(language.meta.volatile, true);
  assert.equal(language.meta.default, 'auto');
  assert.deepEqual(language.list.map(id => node(id).value), ['auto', 'en', 'zh']);
  for (const id of language.list) assertLocalized(id);

  const source = node(node(fields.sources).inner);
  assert.equal(source.list.length, 4);
  for (const variant of source.list.map(node)) {
    for (const id of Object.values(variant.dict)) assertLocalized(id);
  }
  assertLocalized(node(fields.indexes).inner);
});

test('schema and Web settings use the same localized field and option copy', () => {
  const { uid, refs } = Config.toJSON();
  const fields = refs[uid].dict;
  const mapping = {
    language: ['language', 'languageHint'],
    requestTimeoutMs: ['requestTimeout', 'requestTimeoutHint'],
    maxMetadataBytes: ['maxMetadata', 'maxMetadataHint'],
    planTtlMs: ['planLifetime', 'planLifetimeHint'],
    githubTokenEnv: ['tokenVariable', 'tokenVariableHint'],
  };
  for (const [field, [label, hint]] of Object.entries(mapping)) {
    const description = refs[fields[field]].meta.description;
    assert.equal(description[''], `${en[label]}. ${en[hint]}`);
    assert.equal(description.zh, `${zh[label]}（${zh[hint].replace(/。$/, '')}）`);
  }
  const choices = refs[fields.language].list.map(id => refs[id]);
  for (const [index, key] of ['languageAuto', 'languageEn', 'languageZh'].entries()) {
    assert.equal(choices[index].meta.description[''], en[key]);
    assert.equal(choices[index].meta.description.zh, zh[key]);
  }
});

test('localized configuration preserves validation and defaults', () => {
  const defaults = Config({});
  assert.equal(defaults.language.get(), 'auto');
  assert.equal(defaults.requestTimeoutMs.get(), 15_000);
  assert.equal(defaults.maxMetadataBytes.get(), 4 * 1024 * 1024);
  assert.equal(defaults.planTtlMs.get(), 600_000);
  assert.equal(defaults.githubTokenEnv.get(), 'GITHUB_TOKEN');
  for (const language of ['auto', 'en', 'zh']) assert.equal(Config({ language }).language.get(), language);
  assert.throws(() => Config({ language: 'fr' }));
  assert.throws(() => Config({ requestTimeoutMs: 99 }));
  assert.throws(() => Config({ sources: { example: { kind: 'github-source', repository: 'invalid', ref: 'main' } } }));
  const sources = {
    a: { kind: 'npm', registry: 'https://registry.example' },
    b: { kind: 'github-source', repository: 'owner/repo', ref: 'main' },
    c: { kind: 'github-release', repository: 'owner/repo', assetTemplate: 'plugin-{tag}.tgz' },
    d: { kind: 'index', url: 'https://index.example' },
  };
  const result = Config({ sources });
  assert.equal(result.sources.a.channel, 'latest');
  assert.equal(result.sources.a.allowPinned, false);
  assert.equal(result.sources.b.ref, 'main');
  assert.equal(result.sources.c.assetTemplate, 'plugin-{tag}.tgz');
  assert.equal(result.sources.d.url, 'https://index.example');
});
