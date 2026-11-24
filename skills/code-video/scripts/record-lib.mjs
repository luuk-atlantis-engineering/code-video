// Recording helpers for screen takes: Chromium at 1920x1080, a visible cursor that glides, human-paced typing, and
// masks applied before the first paint (blurred or hidden selectors, rows hidden by their words, no real clipboard).
// Frames come from a CDP screencast (JPEG 95) and are encoded with x264 at CRF 14, which keeps UI text sharp.
//
// Copy to <video folder>/record/lib.mjs; takes land in <video folder>/takes/. Needs playwright-core and its Chromium
// (npx playwright install chromium); $CHROME overrides the browser, $FFMPEG the encoder (default: ffmpeg on PATH).
//
// A take, in short:
//   import { open, close, capture, glideClick, typeHuman, readSecrets } from './lib.mjs';
//   const run = await open({ blur: ['#token-value'], hide: ['.sso-buttons'], hideRows: ['leftover-row'] });
//   const rec = await capture(run.page, 'take-3-create');
//   ... glideClick / typeHuman ...; rec.mark('created'); ...
//   await rec.stop(); await close(run);
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const SIZE = { width: 1920, height: 1080 };
export const TAKES = fileURLToPath(new URL('../takes/', import.meta.url));

// A cursor drawn in the page, since a headless browser shows none. It follows real mouse events and dips on a click.
const CURSOR = `
(() => {
  if (window.__vidCursor) return; window.__vidCursor = true;
  const add = () => {
    const c = document.createElement('div');
    c.id = 'vid-cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;' +
      'transform:translate(-3px,-2px);transition:transform .08s;background:no-repeat center/contain url("data:image/svg+xml;utf8,' +
      encodeURIComponent('<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\'><path d=\\'M3 2l7 19 2.6-7.4L20 11z\\' fill=\\'white\\' stroke=\\'black\\' stroke-width=\\'1.5\\' stroke-linejoin=\\'round\\'/></svg>') + '")';
    document.documentElement.appendChild(c);
    // The position survives page loads in sessionStorage, which some pages (data: URLs) don't allow.
    const save = (v) => { try { sessionStorage.setItem('vidXY', v); } catch (e) {} };
    const load = () => { try { return sessionStorage.getItem('vidXY'); } catch (e) { return null; } };
    const at = (x, y) => { c.style.left = x + 'px'; c.style.top = y + 'px'; save(x + ',' + y); };
    const last = (load() || '960,540').split(',');
    at(+last[0], +last[1]);
    addEventListener('mousemove', e => { at(e.clientX, e.clientY); }, true);
    addEventListener('mousedown', () => { c.style.transform = 'translate(-3px,-2px) scale(.85)'; }, true);
    addEventListener('mouseup', () => { c.style.transform = 'translate(-3px,-2px)'; }, true);
  };
  if (document.documentElement) add(); else addEventListener('DOMContentLoaded', add);
})();`;

// Masks, before the first paint, on every page of the take. Never rely on cutting a frame out afterwards.
function masks({ blur, hide, css, hideRows }) {
  const rules = (blur.length ? `${blur.join(', ')} { filter: blur(12px) !important; }` : '') +
    (hide.length ? `${hide.join(', ')} { display: none !important; }` : '') + css;
  return `
(() => {
  const words = ${JSON.stringify(hideRows)};
  const put = () => {
    const s = document.createElement('style');
    s.textContent = ${JSON.stringify(rules)};
    document.documentElement.appendChild(s);
  };
  if (document.documentElement) put(); else addEventListener('DOMContentLoaded', put);
  try { if (navigator.clipboard) navigator.clipboard.writeText = () => Promise.resolve(); } catch (e) {}
  if (!words.length) return;
  const sweep = () => {
    for (const tr of document.querySelectorAll('tr')) {
      if (tr.style.display !== 'none' && words.some(w => tr.textContent.includes(w))) tr.style.display = 'none';
    }
  };
  new MutationObserver(sweep).observe(document, { childList: true, subtree: true });
})();`;
}

// A browser with one page.
//   blur: selectors blurred (secrets, other people's data); hide: selectors removed; css: any extra rules;
//   hideRows: words whose table rows never show (leftover test data, say).
// bypassCSP is on because a strict Content-Security-Policy blocks injected styles, and the masks would never apply.
export async function open({ headless = true, viewport = SIZE, userAgent, locale = 'en-GB', blur = [], hide = [], css = '', hideRows = [] } = {}) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, headless });
  const context = await browser.newContext({
    viewport, ignoreHTTPSErrors: true, locale, colorScheme: 'light', userAgent, bypassCSP: true,
  });
  await context.addInitScript(CURSOR);
  await context.addInitScript(masks({ blur, hide, css, hideRows }));
  const page = await context.newPage();
  await page.mouse.move(960, 540);
  return { browser, context, page };
}

export async function close({ browser, context }) {
  await context.close();
  await browser.close();
}

// Glides to the element's centre in small steps: easy to follow on screen.
export async function glide(page, locator, { steps = 28 } = {}) {
  await locator.waitFor({ state: 'visible' });
  const box = await locator.boundingBox();
  if (!box) throw new Error('not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps });
}

// Glides, pauses, then clicks.
export async function glideClick(page, locator, { pause = 350, steps = 28 } = {}) {
  await glide(page, locator, { steps });
  await page.waitForTimeout(pause);
  await locator.click();
}

// Types like a person, about 85 ms a key.
export async function typeHuman(locator, text, delay = 85) {
  await locator.click();
  await locator.pressSequentially(text, { delay });
}

// A CDP screencast of the page, encoded to takes/<take>.mp4 when stopped, with takes/<take>.json holding the take's
// length and its marks. Frames come only when the page repaints, so each frame is held until the next one.
export async function capture(page, take) {
  const dir = `${TAKES}${take}/`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  let stopped = false;
  cdp.on('Page.screencastFrame', (f) => {
    if (stopped) return;
    const name = `f${String(frames.length + 1).padStart(6, '0')}.jpg`;
    writeFileSync(dir + name, Buffer.from(f.data, 'base64'));
    frames.push({ name, t: f.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const marks = [];
  return {
    // A named moment, for the cut: seconds from the take's first frame.
    mark(label) { marks.push({ label, at: Date.now() / 1000 }); },
    async stop() {
      await page.waitForTimeout(300);
      await cdp.send('Page.stopScreencast').catch(() => {});
      stopped = true;
      const end = Date.now() / 1000;
      if (!frames.length) throw new Error('no frames');
      let list = '';
      frames.forEach((f, i) => {
        const next = i + 1 < frames.length ? frames[i + 1].t : end;
        list += `file '${f.name}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}\n`;
      });
      list += `file '${frames[frames.length - 1].name}'\n`;
      writeFileSync(dir + 'list.txt', list);
      const out = `${TAKES}${take}.mp4`;
      execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', dir + 'list.txt',
        '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', out]);
      const t0 = frames[0].t;
      const timing = { frames: frames.length, seconds: +(end - t0).toFixed(2), marks: marks.map((m) => ({ label: m.label, at: +(m.at - t0).toFixed(2) })) };
      writeFileSync(`${TAKES}${take}.json`, JSON.stringify(timing, null, 2));
      rmSync(dir, { recursive: true, force: true });
      return timing;
    },
  };
}

// KEY=VALUE pairs from a file, read in place at run time. Use it for test logins: never print, copy or log the values.
export function readSecrets(file) {
  const values = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) values[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return values;
}
