import test from 'node:test';
import assert from 'node:assert/strict';
import { Config } from '../dist/config.js';
import { en, zh, type UpdaterSettingsLocaleKey } from '../dist/client/locales.js';

interface JsonSchema {
  meta: { description?: Record<string, string>; volatile?: boolean; default?: unknown };
  dict?: Record<string, string>;
  list?: string[];
  inner?: string;
  value?: unknown;
}

function serializedConfig(): { uid: string; refs: Record<string, JsonSchema> } {
  return Config.toJSON() as unknown as { uid: string; refs: Record<string, JsonSchema> };
}

test('serialized configuration describes fields and choices in English and Chinese', () => {
  const serialized = serializedConfig();
  const refs = serialized.refs;
  const node = (id: string | undefined): JsonSchema => {
    assert.ok(id);
    const schema = refs[id];
    assert.ok(schema);
    return schema;
  };
  const root = refs[serialized.uid];
  assert.ok(root);
  const fields = root.dict;
  assert.ok(fields);
  const assertLocalized = (id: string) => {
    const description = node(id).meta.description;
    assert.ok(description, `missing localized description for ${id}`);
    assert.ok(description[''], `missing English description for ${id}`);
    assert.ok(description.zh, `missing Chinese description for ${id}`);
  };

  assert.deepEqual(Object.keys(fields).sort(), ['githubTokenEnv', 'indexes', 'language', 'maxMetadataBytes', 'planTtlMs', 'requestTimeoutMs', 'sources']);
  for (const id of Object.values(fields)) assertLocalized(id);
  const languageField = fields.language;
  assert.ok(languageField);
  const language = node(languageField);
  assert.ok(language.list);
  assert.equal(language.meta.volatile, true);
  assert.equal(language.meta.default, 'auto');
  assert.deepEqual(language.list.map(schema => node(schema).value), ['auto', 'en', 'zh']);
  for (const id of language.list) assertLocalized(id);

  const sourcesField = fields.sources;
  assert.ok(sourcesField);
  const sources = node(sourcesField);
  assert.ok(sources.inner);
  const source = node(sources.inner);
  assert.ok(source.list);
  assert.equal(source.list.length, 4);
  for (const variant of source.list.map(schema => node(schema))) {
    assert.ok(variant.dict);
    for (const id of Object.values(variant.dict)) assertLocalized(id);
  }
  const indexesField = fields.indexes;
  assert.ok(indexesField);
  const indexes = node(indexesField);
  assert.ok(indexes.inner);
  assertLocalized(indexes.inner);
});

test('schema and Web settings use the same localized field and option copy', () => {
  const serialized = serializedConfig();
  const refs = serialized.refs;
  const root = refs[serialized.uid];
  assert.ok(root?.dict);
  const fields = root.dict;
  const mapping = {
    language: ['language', 'languageHint'],
    requestTimeoutMs: ['requestTimeout', 'requestTimeoutHint'],
    maxMetadataBytes: ['maxMetadata', 'maxMetadataHint'],
    planTtlMs: ['planLifetime', 'planLifetimeHint'],
    githubTokenEnv: ['tokenVariable', 'tokenVariableHint'],
  } as const;
  for (const [field, [label, hint]] of Object.entries(mapping) as Array<[keyof typeof mapping, readonly [UpdaterSettingsLocaleKey, UpdaterSettingsLocaleKey]]>) {
    const fieldSchema = fields[field];
    assert.ok(fieldSchema);
    const schema = refs[fieldSchema];
    assert.ok(schema);
    const description: string | Record<string, string> | undefined = schema.meta.description;
    assert.ok(description && typeof description !== 'string');
    assert.equal(description[''], en[hint]);
    assert.equal(description.zh, `${zh[label]}（${zh[hint].replace(/。$/, '')}）`);
  }
  assert.equal(en.languageZh, '简体中文');
  const languageSchema = fields.language;
  assert.ok(languageSchema);
  const language = refs[languageSchema];
  assert.ok(language?.list);
  const choices = language.list.map(id => refs[id]);
  for (const [index, key] of (['languageAuto', 'languageEn', 'languageZh'] as const).entries()) {
    const description = choices[index]?.meta.description;
    assert.ok(description && typeof description !== 'string');
    assert.equal(description[''], en[key]);
    assert.equal(description.zh, zh[key]);
  }
});

test('localized configuration preserves validation and defaults', () => {
  const defaults = Config({});
  assert.equal(defaults.language.get(), 'auto');
  assert.equal(defaults.requestTimeoutMs.get(), 15_000);
  assert.equal(defaults.maxMetadataBytes.get(), 4 * 1024 * 1024);
  assert.equal(defaults.planTtlMs.get(), 600_000);
  assert.equal(defaults.githubTokenEnv.get(), 'GITHUB_TOKEN');
  for (const language of ['auto', 'en', 'zh'] as const) assert.equal(Config({ language }).language.get(), language);
  assert.throws(() => Config({ language: 'fr' as never }));
  assert.throws(() => Config({ requestTimeoutMs: 99 }));
  assert.throws(() => Config({ sources: { example: { kind: 'github-source', repository: 'invalid', ref: 'main' } } }));
  const sources = {
    a: { kind: 'npm', registry: 'https://registry.example' },
    b: { kind: 'github-source', repository: 'owner/repo', ref: 'main' },
    c: { kind: 'github-release', repository: 'owner/repo', assetTemplate: 'plugin-{tag}.tgz' },
    d: { kind: 'index', url: 'https://index.example' },
  };
  const result = Config({ sources: sources as never });
  assert.equal(result.sources.a?.channel, 'latest');
  assert.equal(result.sources.a?.allowPinned, false);
  assert.equal(result.sources.b?.ref, 'main');
  assert.equal(result.sources.c?.assetTemplate, 'plugin-{tag}.tgz');
  assert.equal(result.sources.d?.url, 'https://index.example');
});
