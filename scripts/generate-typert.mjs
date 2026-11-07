import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator';

const root = await mkdtemp(join(tmpdir(), 'dsh-updater-typert-'));
const packageRoot = join(root, 'packages', 'updater');
try {
  await mkdir(packageRoot, { recursive: true });
  await cp('src', join(packageRoot, 'src'), { recursive: true });
  await symlink(resolve('node_modules'), join(root, 'node_modules'), 'dir');
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  manifest.exports = {
    '.': './src/github-remote.ts',
    './typert': { types: './lib/typert.host.d.ts', default: './lib/typert.host.js' },
    './remote': { types: './lib/typert.remote-client.d.ts', default: './lib/typert.remote-client.js' },
  };
  manifest.files = ['lib/typert.host.js', 'lib/typert.host.d.ts', 'lib/typert.remote-client.js', 'lib/typert.remote-client.d.ts'];
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify(manifest));
  await writeFile(join(root, 'typert-protocol.d.ts'), `declare module '@deepseek-ai/dsh-typert-protocol' {\n  import type { Context } from '@deepseek-ai/cordis';\n  export abstract class TypertRemoteService { protected constructor(ctx: Context, serviceKey: string); readonly ctx: Context; }\n  export const Remote: any;\n}\n`);
  await writeFile(join(root, 'tsconfig.base.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2023', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, composite: true,
    skipLibCheck: true, noEmit: true, jsx: 'react-jsx', types: ['node'],
    paths: { '@deepseek-ai/dsh-typert-protocol': ['./typert-protocol.d.ts'] },
  } }));
  await writeFile(join(root, 'tsconfig.host.json'), JSON.stringify({ extends: './tsconfig.base.json', files: [], references: [{ path: './packages/updater' }] }));
  await writeFile(join(packageRoot, 'tsconfig.json'), JSON.stringify({ extends: '../../tsconfig.base.json', include: ['src/github-remote.ts', '../../typert-protocol.d.ts'] }));
  const generator = new WorkspaceTypertGenerator(root, { checkDiagnostics: false });
  const artifacts = generator.generate([manifest.name], ['host']);
  if (artifacts.length !== 1 || !artifacts[0].remote) throw new Error('Expected one Host and Remote contribution.');
  const artifact = artifacts[0];
  await mkdir('dist', { recursive: true });
  await Promise.all([
    writeFile('dist/typert.host.js', artifact.js),
    writeFile('dist/typert.host.d.ts', artifact.dts),
    writeFile('dist/typert.remote-client.js', artifact.remote.js),
    writeFile('dist/typert.remote-client.d.ts', artifact.remote.dts),
    writeFile('dist/typert.remote-client.d.ts.map', artifact.remote.dtsMap),
  ]);
} finally {
  const absolute = resolve(root);
  if (!absolute.startsWith(resolve(tmpdir()) + sep) || !absolute.slice(resolve(tmpdir()).length + 1).startsWith('dsh-updater-typert-')) throw new Error('Refusing to remove an unexpected temporary directory.');
  await rm(absolute, { recursive: true, force: true });
}
