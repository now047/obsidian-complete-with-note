import esbuild from 'esbuild';
import process from 'process';

const mode = process.argv[2];

if (mode === 'test') {
  // Bundle only the pure logic modules so plain node can test them.
  await esbuild.build({
    entryPoints: ['src/lineEdit.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: 'test/lineEdit.mjs',
    logLevel: 'info',
  });
  await esbuild.build({
    entryPoints: ['src/template.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: 'test/template.mjs',
    logLevel: 'info',
  });
} else {
  await esbuild.build({
    entryPoints: ['src/main.ts'],
    bundle: true,
    external: [
      'obsidian',
      'electron',
      '@codemirror/autocomplete',
      '@codemirror/collab',
      '@codemirror/commands',
      '@codemirror/language',
      '@codemirror/lint',
      '@codemirror/search',
      '@codemirror/state',
      '@codemirror/view',
      '@lezer/common',
      '@lezer/highlight',
      '@lezer/lr',
      ...Object.keys(process.binding?.('natives') ?? {}),
    ],
    format: 'cjs',
    target: 'es2018',
    platform: 'browser',
    outfile: 'dist/complete-with-note/main.js',
    logLevel: 'info',
  });
}
