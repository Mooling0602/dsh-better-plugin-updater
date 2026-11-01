import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';

// DSH loads browser halves through its module-factory registry, not native ESM.
const result = await build({
  entryPoints: ['src/client/index.ts'], bundle: true, platform: 'browser',
  format: 'cjs', target: 'es2022', write: false, logLevel: 'warning',
});
if (result.outputFiles.length !== 1) throw new Error('Expected one self-contained Client bundle.');
const code = `window.__ModuleLoader__.load({\n  id: "dsh-better-plugin-updater",\n  factory: () => {\n    var module = { exports: {} };\n${result.outputFiles[0].text}\n    return module.exports;\n  }\n});\n`;
await writeFile('dist/client.js', code);
