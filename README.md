# code-video

A [Claude Code](https://claude.com/claude-code) skill that makes product intros and explainer videos entirely from
code: no AI video generator, no stock footage. Claude writes the script with you, builds every frame as an HTML page
animated with GSAP, records the real app with a scripted browser, composes the music, and renders a 1080p MP4 with
[HyperFrames](https://hyperframes.heygen.com). You decide, write the final wording, and generate the voice-over.

## Why

A video made from code can be changed like code. A new line in the script, a renamed button or a new brand colour means
running a few scripts and rendering again, not a reshoot. Every frame is checked on stills before it's rendered, and
every claim in the script is checked against the product.

The skill comes out of a 2-minute product video that went from brief to final render in one day, and an earlier drawn
explainer.

## What the skill does

Ten steps, each ending with something you can look at before the next one starts:

1. **Brief** (you): topic, length, audience, must-haves.
2. **Plan**: assumptions, a scene outline and a few questions. You answer.
3. **Script**: drafts until you're happy; your rewrite is final.
4. **Voice-over** (you): Claude hands you plain text for your text-to-speech tool (ElevenLabs, say); you drop in the MP3.
5. **Timing**: ffmpeg finds the pauses, and `align.py` matches every sentence to them, so scenes and captions land on
   the words.
6. **Motion scenes**: HTML and GSAP in your brand, checked on stills.
7. **Screen recordings**: Playwright on a test environment, with a drawn cursor and masks over secrets and real data.
8. **Rough cut**: the takes retimed to the voice, music composed in code and ducked under it. You review stills and a
   preview mix.
9. **Final render**: an MP4 with burned-in captions, `.srt` and `.vtt` files, measured loudness, and contact sheets
   checked.
10. **Sign-off** (you): you listen, because Claude can't.

## What's in it

| File (in `skills/code-video/`) | What it does |
|---|---|
| `SKILL.md` | The workflow, the hard rules and the traps |
| `scripts/align.py` | Aligns the script's sentences to the voice's pauses, by dynamic programming |
| `scripts/cut.py` | Cuts and retimes screen takes to moments in the narration, and writes them into the page |
| `scripts/record-lib.mjs` | Playwright recording helpers: a cursor, paced typing, masks before the first paint, a CDP screencast |
| `scripts/probe.mjs` | Stills at any second, failing on any JavaScript error |
| `scripts/captions.mjs` | `.srt` and `.vtt` captions from the same sentence times |

## What you need

Node 22 or later, Python 3, a full ffmpeg build with ffprobe, and an account with a text-to-speech service whose plan
covers commercial use. HyperFrames, GSAP and Playwright are installed per video by npm.

## Install

```sh
git clone https://github.com/luuk-atlantis-engineering/code-video.git
cp -r code-video/skills/code-video ~/.claude/skills/
```
