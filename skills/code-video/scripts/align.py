"""Aligns the voice-over's sentences to its pauses, and the scenes (paragraphs) with them.

Each sentence boundary takes one detected pause, chosen by dynamic programming, so that every sentence's length is as
close as possible to its word count times one fitted speaking rate.

Reads (from the video folder, the parent of this script's folder unless --folder is given):
  script-tts.txt               the text the voice was made from; paragraphs (blank lines) are scenes
  audio/silences-fine.txt      ffmpeg silencedetect output for audio/narration.mp3
Writes:
  audio/timings.json           sentences and scenes with start and end times
  js/times.js                  window.T = {S: [{s, e, scene, t}], C: [{s, e}], END} for the composition

Usage: python -I tools/align.py [--folder DIR] [--duration SECONDS] [--tail SECONDS] [--spell SAID=SHOWN ...]
  --duration  the narration's length; read with ffprobe ($FFPROBE or ffprobe on PATH) when left out
  --tail      seconds the film runs after the voice ends (the end card); END = voice end + tail (default 4.75)
  --spell     a word spelled for the voice and shown differently on screen, e.g. --spell "engine x=nginx"
"""
import argparse
import json
import os
import re
import subprocess
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument('--folder', type=Path, default=Path(__file__).resolve().parent.parent)
ap.add_argument('--duration', type=float)
ap.add_argument('--tail', type=float, default=4.75)
ap.add_argument('--spell', action='append', default=[])
args = ap.parse_args()
root = args.folder

text = (root / 'script-tts.txt').read_text(encoding='utf-8').strip()
paras = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
sentences, para_of = [], []
for i, p in enumerate(paras):
    for s in re.split(r'(?<=[.?!])\s+', p):
        if s.strip():
            sentences.append(' '.join(s.split()))
            para_of.append(i)
words = [len(s.replace('—', ' ').split()) for s in sentences]

duration = args.duration
if duration is None:
    probe = subprocess.run([os.environ.get('FFPROBE', 'ffprobe'), '-v', 'error', '-show_entries', 'format=duration',
                            '-of', 'default=nw=1:nk=1', str(root / 'audio' / 'narration.mp3')],
                           capture_output=True, text=True, check=True)
    duration = float(probe.stdout.strip())

raw = (root / 'audio' / 'silences-fine.txt').read_text(encoding='utf-8')
starts = [float(x) for x in re.findall(r'silence_start: ([0-9.]+)', raw)]
ends = [float(x) for x in re.findall(r'silence_end: ([0-9.]+)', raw)]
pauses = list(zip(starts, ends))
# Leading and trailing silence are not sentence boundaries.
head = pauses[0][1] if pauses and pauses[0][0] < 0.05 else 0.0
tail_start = pauses[-1][0] if pauses and pauses[-1][1] > duration - 0.1 else duration
inner = [p for p in pauses if p[0] > head + 0.05 and p[1] < tail_start - 0.05]

n, m = len(sentences), len(inner)
if n > 1 and m < n - 1:
    raise SystemExit(f'{n} sentences but only {m} pauses: lower silencedetect\'s d= and run it again')
rate = (tail_start - head) / sum(words)
times = []
if n == 1:
    times.append((head, tail_start))
else:
    INF = float('inf')
    # best[i][j]: sentences 0..i placed, the boundary after sentence i at pause j.
    best = [[INF] * m for _ in range(n - 1)]
    back = [[-1] * m for _ in range(n - 1)]
    for j, (a, b) in enumerate(inner):
        best[0][j] = (a - head - words[0] * rate) ** 2
    for i in range(1, n - 1):
        for j in range(i, m):
            a = inner[j][0]
            for k in range(i - 1, j):
                if best[i - 1][k] == INF:
                    continue
                cost = best[i - 1][k] + (a - inner[k][1] - words[i] * rate) ** 2
                if cost < best[i][j]:
                    best[i][j], back[i][j] = cost, k
    _, j = min((best[n - 2][j] + (tail_start - inner[j][1] - words[-1] * rate) ** 2, j) for j in range(m))
    chosen = [j]
    for i in range(n - 2, 0, -1):
        j = back[i][j]
        chosen.append(j)
    chosen.reverse()
    prev = head
    for i in range(n):
        end = inner[chosen[i]][0] if i < n - 1 else tail_start
        times.append((prev, end))
        if i < n - 1:
            prev = inner[chosen[i]][1]


def shown(sentence):
    for pair in args.spell:
        said, _, screen = pair.partition('=')
        sentence = re.sub(rf'\b{re.escape(said)}\b', screen, sentence)
    return sentence


sents = [{'sentence': i + 1, 'scene': para_of[i] + 1, 'start': round(s, 2), 'end': round(e, 2), 'text': sentences[i]}
         for i, (s, e) in enumerate(times)]
scenes = []
for k in range(len(paras)):
    ts = [t for t in sents if t['scene'] == k + 1]
    scenes.append({'scene': k + 1, 'start': ts[0]['start'], 'end': ts[-1]['end']})
(root / 'audio' / 'timings.json').write_text(
    json.dumps({'words_per_minute': round(60 / rate), 'sentences': sents, 'scenes': scenes}, indent=1, ensure_ascii=False),
    encoding='utf-8')
T = {
    'S': [{'s': t['start'], 'e': t['end'], 'scene': t['scene'], 't': shown(t['text'])} for t in sents],
    'C': [{'s': c['start'], 'e': c['end']} for c in scenes],
    'END': round(tail_start + args.tail, 2),
}
(root / 'js').mkdir(exist_ok=True)
(root / 'js' / 'times.js').write_text(
    '// Generated by tools/align.py from script-tts.txt and the narration\'s pauses. Do not edit.\nwindow.T = '
    + json.dumps(T, ensure_ascii=False) + ';\n', encoding='utf-8')

print(f'{n} sentences, {m} pauses, {60 / rate:.0f} words a minute, film END {T["END"]} s')
for c in scenes:
    print(f"scene {c['scene']}: {c['start']:6.2f} - {c['end']:6.2f}  ({c['end'] - c['start']:5.2f} s)")
for t in sents:
    expected = words[t['sentence'] - 1] * rate
    actual = t['end'] - t['start']
    if not 0.6 < actual / expected < 1.6:
        print(f"  check sentence {t['sentence']} by hand: {actual:.2f} s for {expected:.2f} s expected: {t['text'][:60]}")
