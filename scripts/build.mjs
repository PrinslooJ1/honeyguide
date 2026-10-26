// Build: bundle src/main.tsx with esbuild, copy public/, stamp the service worker.
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const serve = process.argv.includes('--serve');
const out = 'dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('public', out, { recursive: true });

const env = {
  'import.meta.env.SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL || ''),
  'import.meta.env.SUPABASE_KEY': JSON.stringify(process.env.SUPABASE_KEY || ''),
  'process.env.NODE_ENV': JSON.stringify(serve ? 'development' : 'production'),
};

const opts = {
  entryPoints: ['src/main.tsx'],
  bundle: true,
  outfile: join(out, 'app.js'),
  format: 'esm',
  target: ['es2020', 'chrome90'],
  jsx: 'automatic',
  minify: !serve,
  sourcemap: serve,
  define: env,
  loader: { '.css': 'css' },
  logLevel: 'info',
};

function listFiles(dir, base = dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? listFiles(p, base) : [p.slice(base.length + 1)];
  });
}

function stampServiceWorker() {
  const files = listFiles(out).filter((f) => f !== 'sw.js' && !f.endsWith('.map'));
  const hash = createHash('sha1');
  for (const f of files) hash.update(readFileSync(join(out, f)));
  const version = hash.digest('hex').slice(0, 10);
  const sw = readFileSync('public/sw.js', 'utf8')
    .replace('__VERSION__', version)
    .replace('__ASSETS__', JSON.stringify(['./', ...files.filter((f) => f !== 'index.html')]));
  writeFileSync(join(out, 'sw.js'), sw);
  console.log(`service worker ${version}, ${files.length} files precached`);
}

if (serve) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: out, port: 5173 });
  console.log(`http://localhost:${port}`);
} else {
  await esbuild.build(opts);
  stampServiceWorker();
}
