import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';

// The module-factory registry hands the factory a require, so Client shared
// dependencies resolve from the assembly instead of being bundled twice.
const external = ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-store'];

// DSH loads browser halves through its module-factory registry, not native ESM. The entry records
// the resolver so the settings page reaches React and the primitive library through it.
const result = await build({
  entryPoints: ['src/client/index.ts'], bundle: true, platform: 'browser',
  format: 'cjs', target: 'es2022', write: false, logLevel: 'warning', external,
});
if (result.outputFiles.length !== 1) throw new Error('Expected one self-contained Client bundle.');
const code = `window.__ModuleLoader__.load({\n  id: "dsh-better-plugin-updater",\n  factory: (require) => {\n    var module = { exports: {} };\n${result.outputFiles[0].text}\n    module.exports.captureHostRequire?.(require);\n    return module.exports;\n  }\n});\n`;
await writeFile('dist/client.js', code);
