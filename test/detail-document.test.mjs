import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

test('localized detail documents are included in the published package', async () => {
  const manifest = await readJson('../package.json');
  for (const [language, expected] of [['en', 'INTRODUCTION.md'], ['zh', 'INTRODUCTION.zh.md']]) {
    const locale = await readJson(`../locale/${language}.json`);
    assert.equal(locale.meta.detail, expected);
    assert.ok(manifest.files.includes(expected));
    const markdown = await readFile(new URL(`../${expected}`, import.meta.url), 'utf8');
    assert.ok(markdown.trim());
    assert.match(markdown, /\/plugin-updater check/);
  }
});
