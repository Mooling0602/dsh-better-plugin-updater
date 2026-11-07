import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const version = argument('version');
const repository = argument('repo');
if (!version || !repository) {
  console.error('Usage: release-notes.mjs --version <x.y.z> --repo <owner/name>');
  process.exit(1);
}

const heading = /^##\s+(.+?)\s*$/;
const subheading = /^###\s+(.+?)\s*$/;
const release = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const sections = [];
let current;
for (const line of (await readFile(join(root, 'CHANGELOG.md'), 'utf8')).split(/\r?\n/)) {
  const match = heading.exec(line);
  if (match) {
    current = { title: match[1], body: [] };
    sections.push(current);
  } else if (current) {
    current.body.push(line);
  }
}
const shared = title => sections.find(section => section.title === title)?.body ?? [];
const body = section => section.body.join('\n').trim();

const requested = sections.find(section => release.test(section.title) && section.title.replace(/^v/, '') === version);
if (!requested) {
  console.error(`CHANGELOG.md has no section for ${version}.`);
  process.exit(1);
}

function splitOverrides(lines) {
  const main = [];
  const overrides = {};
  let target = main;
  for (const line of lines) {
    const match = subheading.exec(line);
    if (match) {
      const key = match[1].toLowerCase();
      if (key === 'header' || key === 'endfix') {
        target = [];
        overrides[key] = target;
      } else {
        target = main;
        target.push(line);
      }
      continue;
    }
    target.push(line);
  }
  return { main: main.join('\n').trim(), overrides };
}

const parsed = splitOverrides(requested.body);
const header = (parsed.overrides.header?.join('\n') ?? body({ body: shared('Header') })).trim();
const endfix = (parsed.overrides.endfix?.join('\n') ?? body({ body: shared('Endfix') })).trim();

const compare = (left, right) => {
  const part = value => value.replace(/^v/, '').split('-')[0].split('.').map(Number);
  const a = part(left);
  const b = part(right);
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
};
const previous = sections
  .map(section => section.title.replace(/^v/, ''))
  .filter(candidate => release.test(candidate) && compare(candidate, version) < 0)
  .sort(compare)
  .at(-1);
const link = previous
  ? `https://github.com/${repository}/compare/${previous}...${version}`
  : `https://github.com/${repository}/compare/${version}`;
const resolvedEndfix = endfix.replaceAll('**full_changelog!**', `**Full Changelog**: ${link}`);

const note = [`## v${version}`, header, parsed.main, resolvedEndfix]
  .filter(part => part !== '')
  .join('\n\n');
process.stdout.write(`${note}\n`);
