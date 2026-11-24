// Loads the composition in headless Chromium, reports JavaScript errors, and saves a still at each given second.
// Look at the stills before any render: one JS error stops the timeline from building, and every frame then shows the
// raw layout.
// Run from the video folder: node tools/probe.mjs 1.5,12,23.4 [outdir]   (outdir defaults to .probe/)
// Needs playwright-core and its Chromium (npx playwright install chromium); $CHROME overrides the browser.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const times = (process.argv[2] || '').split(',').filter(Boolean).map(Number);
const out = process.argv[3] || join(root, '.probe');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--allow-file-access-from-files'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(pathToFileURL(join(root, 'index.html')).href, { waitUntil: 'load' });
await page.waitForFunction('window.__built', null, { timeout: 20000 }).catch(() => errors.push('the timeline never built'));
await page.evaluate(async () => { await document.fonts.ready; });
console.log('built:', JSON.stringify(await page.evaluate(() => window.__built || null)));
for (const t of times) {
  await page.evaluate((at) => { window.__timelines.main.seek(at, false); }, t);
  await page.waitForTimeout(80);
  const file = join(out, `T${t.toFixed(2).padStart(7, '0')}.png`);
  await page.screenshot({ path: file });
  console.log('still', file);
}
await browser.close();
if (errors.length) {
  console.log(errors.join('\n'));
  process.exit(1);
}
