import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const heading = /^##\s+(.+?)\s*$/;
const subheading = /^###\s+(.+?)\s*$/;
const release = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const arguments_ = process.argv.slice(2);
const options = { repo: process.env.GITHUB_REPOSITORY, tag: undefined, output: undefined };
const positional = [];
for (let index = 0; index < arguments_.length; index++) {
  const argument = arguments_[index];
  if (argument.startsWith('--')) {
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith('--')) fail(`Missing value for ${argument}.`);
    options[argument.slice(2)] = value;
    index++;
  } else {
    positional.push(argument);
  }
}

const version = positional[0]?.replace(/^v/, '');
if (!version || !release.test(version)) fail('Usage: release-notes.mjs <version> [--tag <tag>] [--repo <owner/name>] [--output <file>]');
if (!options.repo) fail('Pass --repo <owner/name> or set GITHUB_REPOSITORY.');
const tag = options.tag ?? version;

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
const text = lines => lines.join('\n').trim();

const requested = sections.find(section => release.test(section.title) && section.title.replace(/^v/, '') === version);
if (!requested) fail(`CHANGELOG.md has no section for ${version}.`);

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
        continue;
      }
      target = main;
    }
    target.push(line);
  }
  return { main: text(main), overrides };
}

const parsed = splitOverrides(requested.body);
const header = text(parsed.overrides.header ?? shared('Header'));
const endfix = text(parsed.overrides.endfix ?? shared('Endfix'));

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
  ? `https://github.com/${options.repo}/compare/${previous}...${tag}`
  : `https://github.com/${options.repo}/compare/${tag}`;
const resolvedEndfix = endfix.replaceAll('**full_changelog!**', `**Full Changelog**: ${link}`);

const note = [header, parsed.main, resolvedEndfix].filter(part => part !== '').join('\n\n');
if (options.output) {
  await writeFile(options.output, `${note}\n`);
} else {
  process.stdout.write(`${note}\n`);
}
