---
name: code-video
description: "Make a product intro, explainer or how-to video entirely from code: the script written with the user, a voice-over the user generates (ElevenLabs or another text-to-speech tool), timings taken from the voice, every frame built as HTML and animated with GSAP, the real app recorded with Playwright with sensitive data masked, music composed in code, rendered to MP4 with HyperFrames, then measured and checked. Use when the user asks for an explainer video, a product or feature video, a how-to or walkthrough video with a voice-over, a video in their brand, or to change or re-render a video made this way. Triggers: 'explainer video', 'product video', 'feature video', 'walkthrough video', 'video with voice-over', 'HyperFrames video', 'make a video about'."
---

# Code-made video

You build the whole video from code. The user decides, writes the final wording and generates the voice. No AI video
generators and no stock footage: every frame comes from HTML, CSS, SVG and GSAP, and HyperFrames renders it to MP4.

Two kinds work well this way. Ask which one if the brief doesn't say.
- **Product intro with real screens:** brand frames around scripted screen recordings of the real app, half marketing
  and half how-to. About 2 minutes.
- **Drawn explainer:** no screens; flat vector scenes, often one friendly character, one continuous camera, sound
  effects on cues (a Kurzgesagt-like look suits it).

## Hard rules

1. **Stop at every hand-off** (marked STOP below) and wait. Each stop shows something the user can look at: a plan, a
   script, stills, a preview. Never move on silently.
2. **You never call the text-to-speech service.** You write the text for it; the user generates the MP3 and puts it in
   `audio/narration.mp3`. Check the service's commercial-use terms in the plan.
3. **No customer or personal data on screen.** A test database may be a copy of real data. Scout every page on stills
   first, and blur or hide anything that isn't test data, including a customer's own sign-in buttons. Keep stills of
   such pages in a scratch folder, never in shared notes.
4. **No secrets on screen or in files.** Token and key fields are blurred before the first paint; passwords show as
   dots; test logins are read in place at run time (`readSecrets()`) and never printed, copied or logged.
5. **Every claim in the script must be true of the product.** Check it in the code or the docs and write down where in
   the decision log. Prefer "hard to crack" over "impossible".
6. **Music is composed in code**, so there is no licence to clear. Use a licensed track only if the user provides one.
7. **Record every decision with its reason** in `DECISIONS.md`, quoting the user, and keep a "Now" section at the top of
   `PROGRESS.md`, so a new session can pick up from the notes alone.
8. **Test environments may be shared.** Book them as the team does, use named test data (`vid-...`), remove it afterwards
   and check that it's gone. Change a setting for a take (a seat limit, say) only with the owner's OK, and put it back.
9. **Keep the video folder out of any code repository.** Use the user's notes folder.

## Set up a video folder

```
<video>/PLAN.md  SCRIPT.md  DECISIONS.md  PROGRESS.md
<video>/script-tts.txt                 the exact text the user pastes into the TTS tool
<video>/index.html  css/  js/          the composition; js/times.js is generated, never edited by hand
<video>/assets/fonts  assets/logo  assets/gsap.min.js
<video>/audio/narration.mp3            from the user
<video>/record/lib.mjs  record/take-*.mjs  takes/*.mp4|json     screen recordings
<video>/clips/                         takes cut to the narration
<video>/tools/                         align.py  cut.py  captions.mjs  probe.mjs  music.mjs
<video>/review/                        what the user reviews
<video>/final/<name>.mp4 .srt .vtt
```

Copy this skill's `scripts/` into it, then install:

```sh
mkdir -p <video>/tools <video>/record
cp <skill>/scripts/align.py <skill>/scripts/cut.py <skill>/scripts/captions.mjs <skill>/scripts/probe.mjs <video>/tools/
cp <skill>/scripts/record-lib.mjs <video>/record/lib.mjs
cd <video> && npm init -y && npm install -D hyperframes gsap playwright-core && npx playwright-core install chromium
mkdir -p assets && cp node_modules/gsap/dist/gsap.min.js assets/
```

Also needed: Python 3 and a full ffmpeg build with ffprobe (on PATH, or set `FFMPEG` and `FFPROBE`). For a logo that
only exists inside a PDF: Poppler's `pdfimages`.

## The steps

### 1. Brief (the user)
Get the topic, length, audience, language, must-haves (music, voice, real screens) and where the brand template is.

### 2. Plan → STOP
Write `PLAN.md`:
- your assumptions: audience, tone, style, and length (plan at about 145 to 165 spoken words a minute);
- a scene outline: time, scene, what's on screen, draft voice-over;
- the music and the voice;
- how the screens are recorded and what never shows;
- a short numbered list of questions.

Record the answers as decisions.

### 3. Script → STOP (usually several rounds)
- One idea per scene, short sentences, a benefit before a feature. Open on a hook question everyone has an answer to.
- Product intro: half marketing, half how-to on the real screens. Explainer: open big, one friendly character, a
  "first, second, third", a dry joke or two, a reflective last line.
- Name only what customers see: no internal project names, codenames or team jargon.
- Don't sell an old feature as new, don't mention what isn't shipped, and don't name regulations unless asked.
- Keep every version in `SCRIPT.md`, newest on top, the older ones marked as replaced. When the user rewrites it, their
  wording is final, word for word.

### 4. Voice-over text → STOP until the MP3 arrives
Write `script-tts.txt`: plain text, one paragraph per scene (the breaks become natural pauses), no markup unless the
tool uses it. Spell names the way they should sound, in this file only; `align.py --spell` puts the real spelling back
for the captions. Some tools take pause marks or an emotion per line: then give a table of line → emotion.

### 5. Timings
- Find the pauses:
  `ffmpeg -hide_banner -i audio/narration.mp3 -af silencedetect=noise=-38dB:d=0.18 -f null - 2>&1 | grep -E "silence_(start|end)" > audio/silences-fine.txt`
  Use a shorter `d=` (0.12) for a voice with short pauses.
- `python -I tools/align.py --tail <seconds of end card> [--spell "said=SHOWN"]`
  - It gives each sentence boundary one pause, by dynamic programming against a fitted speaking rate.
  - It writes `audio/timings.json` and `js/times.js` (`window.T = {S: [{s, e, scene, t}], C: [{s, e}], END}`).
  - It lists the sentences whose length looks off: listen to those spots, or ask the user to.
- A word's moment is its place in the sentence: `s + (e - s) * charIndex / length - 0.12`. Use the same helper in the
  composition and in `cut.py`'s `word()`. For an exact trigger word (an explainer's reveal), use the loudness onsets.
- Explainer: show a beat table (time, line, the one hero visual, on-screen text), then STOP before building.

### 6. Composition
- `index.html`:
  - a root `<div id="root" data-composition-id="main" data-start="0" data-duration="<END>" data-width="1920" data-height="1080">`;
  - `<audio>` tags for the voice and the music, each with `data-start`, `data-duration` and `data-volume`;
  - `<!-- clips:start (written by tools/cut.py) -->` and `<!-- clips:end -->` where the screen clips go.
- `js/main.js`:
  - builds ONE paused GSAP timeline from `T`;
  - registers it as `window.__timelines.main`;
  - sets `window.__built = {duration}`.
- Burn the captions in from `T.S`: each sentence shows from its start to 0.15 s after its end.
- The brand:
  - take the colours, fonts and motifs from the user's template, and record them as a decision;
  - bundle the font in `assets/fonts`, since the render machine may not have it;
  - logos: SVG first; if one only exists in a PDF, extract its largest bitmap with `pdfimages`, key the background to
    transparency, and record that.
- Look before you go on: `node tools/probe.mjs 12,23.4,45` saves stills to `.probe/` and fails on any JS error. Also run
  `npx hyperframes lint .`, `npx hyperframes check` and `npx hyperframes snapshot --at 1,3,5`.
- Take a still at the middle of every sentence and of every transition. Fix overlaps, cropping, unreadable text, early
  pop-ins and card edges.

### 7. Screen recordings (product intro) — book the test environment first
- `record/lib.mjs` does the hard parts:
  - `open({blur, hide, css, hideRows})`: Chromium at 1920x1080, with masks injected before the first paint. It also
    bypasses the page's Content-Security-Policy, which would otherwise block the masks.
  - a cursor drawn in the page: headless Chromium shows none;
  - `glide()` / `glideClick()` move the mouse in visible steps; `typeHuman()` types at about 85 ms a key;
  - `capture(page, take)`: a CDP screencast at JPEG 95, encoded with x264 at CRF 14 into `takes/<take>.mp4`, plus
    `takes/<take>.json` with the take's marks (`rec.mark('created')`);
  - `readSecrets(file)` reads test logins in place.
- First write a scout script that saves stills of every page the takes will show, to a scratch folder. Check each one
  for real data, and add masks until nothing real shows.
- Write one script per take, `record/take-<n>-<name>.mjs`. Mark every moment the cut will need.
- Afterwards, delete the test data, check that it's gone, and hand the environment back.

### 8. Rough cut → STOP
- Fill in `SCENES` in `tools/cut.py`: each segment of a take is sped up or slowed down to end on a moment in the
  narration. Keep each segment between about 0.6x and 1.6x. Then run `python -I tools/cut.py`. It writes `clips/` and
  the static `<video>` tags into `index.html`.
- Write `tools/music.mjs`: music synthesised sample by sample in Node, written as a WAV.
  - Instruments: a warm pad, a pluck arpeggio, a sub bass, a soft kick and hats.
  - Risers and impacts on the film's turns, and the mood changing per act.
  - Ducking: under every sentence in `T.S`, with the bed about 12 to 14 dB under the voice.
  - Convert it to MP3 with ffmpeg. An explainer also gets sound effects, synthesised at cue times the timeline records.
- Give the user stills at the key moments (contact sheets, `review/stills/`) and a voice-and-music mix
  (`review/mix-preview.mp3`). They listen; you can't.

### 9. Final render
- Check one moment first: `npx hyperframes render . -o .test/a.mp4 --start 51 --end 53 --fps 30 --quality delivery --video-frame-format png`.
- Then the whole film: `npx hyperframes render . -o final/<name>.mp4 --fps 30 --quality delivery --video-frame-format png --workers 4`.
  A 2-minute film takes about 2.5 minutes.
- `node tools/captions.mjs <name>` writes `final/<name>.srt` and `.vtt`.
- Measure the loudness: `ffmpeg -i final/<name>.mp4 -af ebur128=peak=true -f null -`. Aim for about -16 LUFS integrated.
- Make contact sheets of the real file, one frame every 3 seconds, and look at every sheet:
  `ffmpeg -i final/<name>.mp4 -vf "fps=1/3,scale=480:270,tile=6x4" sheet-%02d.png`.

### 10. Hand-off
Tell the user where the files are, what you checked, and what you could not check: you can't hear the mix.

## Traps

| Trap | Do this |
|---|---|
| One JS error, and the timeline never registers: every frame shows the raw layout | Run `probe.mjs` before any render |
| Screen clips added by script render frozen | Keep them as static `<video>` tags in `index.html` (`cut.py` writes them) |
| Frames differ between renders | No `Math.random` and no clock: use a seeded random |
| Tweening x/y of an SVG group that has `transform="translate()"` replaces the translate | Wrap the group and tween the outer one |
| `transformOrigin` on SVG is relative to the element's own box | Use `svgOrigin` for absolute SVG coordinates |
| `fromTo` shows its from-state at once | Start entrances off-screen or at opacity 0 |
| The same SVG logo twice shares its ids, and the second copy clips to nothing | Give every copy unique ids |
| `check` warns of stillness during SVG motion (`dead_stretch`), unread lines on rotating labels, and contrast on semi-transparent cards | False positives: judge from stills |
| "Overlapping tweens" in if/else branches that never run together | Ignore it once the stills look right |
| "Sparse keyframes" on a clip | Only preview seeking is slower; rendering is unaffected |
| A scene smaller than the frame during a camera move | Card edges show: keep the incoming scene at least full frame |
| A strict Content-Security-Policy blocks the recording masks | `open()` bypasses it, in its own browser only |
| Pop-ups and dialogs don't carry the host's test ids | Find them by their class or text |
| An idle timer only starts after the first activity event | Send one (a key or a mouse move) before you time an idle take |
| The voice reads a product name letter by letter | Spell it as it sounds in `script-tts.txt` only, and use `--spell` |
