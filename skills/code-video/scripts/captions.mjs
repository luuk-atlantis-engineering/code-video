// The film's captions as sidecar files (SRT and WebVTT), from the same sentence times as the burned-in captions
// (js/times.js; each shows from its start to 0.15 s after its end, or until the next one starts).
// Run from the video folder: node tools/captions.mjs <name>   → final/<name>.srt and final/<name>.vtt
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const name = process.argv[2];
if (!name) {
  console.error('usage: node tools/captions.mjs <name>');
  process.exit(1);
}
const src = readFileSync(HERE + 'js/times.js', 'utf8');
const T = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));

const stamp = (t, sep) => {
  const ms = Math.round(t * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}${sep}${p(ms % 1000, 3)}`;
};
const cues = T.S.map((s, i) => {
  const next = T.S[i + 1];
  const end = Math.min(s.e + 0.15, next ? next.s : Infinity);
  return { start: s.s, end, text: s.t };
});
const srt = cues.map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`).join('\n');
const vtt = 'WEBVTT\n\n' + cues.map((c) => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`).join('\n');
mkdirSync(HERE + 'final', { recursive: true });
writeFileSync(`${HERE}final/${name}.srt`, srt);
writeFileSync(`${HERE}final/${name}.vtt`, vtt);
console.log(`captions: ${cues.length} cues → final/${name}.srt, final/${name}.vtt`);
