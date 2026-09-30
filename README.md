<p align="center"><img src="brand/logo-wordmark.png" alt="Clack" width="330"></p>

A minimalist typing test — inspired by the Bemonkey iOS app and built as a single self-contained `index.html` with no build step and no dependencies.

**Live demo:** https://bralash.github.io/clack/

![Clack demo: a typing test with combo and live WPM, the results screen, the typing shooter, and the activity heatmap](docs/demo.gif)

## Features

### Modes
- **Time** — 15 / 30 / 60 / 120 / 180 second runs.
- **Words** — 10 / 25 / 50 / 100 word runs.
- **Quote** — type real quotes (short / medium / long); the result screen credits the author.
- **Shoot** — a ZType-style typing game: words drift toward your ship, type one to lock on and fire, destroy it before it reaches the base. Difficulties: `calm` / `normal` / `frenzy`.
  - **Power-ups** fall as glowing capsules — type the name to grab it:
    `freeze` slows everything down for 5s · `double` doubles points for 10s ·
    `shield` restores a life or blocks the next hit · `boom` stores a bomb you set off with **Space** to clear the screen.
    Missing a power-up never costs a life.

- **Daily challenge** — the same 30 words for everyone each day, one attempt. Share your result as a Wordle-style
  grid (🟩 clean word, 🟨 mistake), post it to 𝕏, or save a result-card image. Consecutive days build a daily streak.

Time and words runs support **punctuation**, **numbers** and **weak keys** modifiers. Weak keys fills a run with words
built from the keys you miss most — also one click away on the stats page. Words **auto-advance** the instant you finish them (right *or* wrong), so nothing interrupts your flow.

### Feel
- Soft mechanical **key-click** and a dull **error thud** (Web Audio, toggleable, with haptics).
- A **caret that pulses** with your rhythm, a **shake** on errors, and a **glow** when you nail a word.
- A faint **live-WPM** readout that rises as you type.
- A **combo multiplier** that grows with each clean word and resets on a mistake.

### Progress & stats
- A GitHub-style **contribution heatmap** of your real daily activity, with day-streak and monthly totals.
- A **stats page**: per-key accuracy heatmap (which keys you fumble), a WPM-over-time chart, and personal bests per mode.
- **Achievements** — 16 badges (speed tiers, accuracy, streaks, volume, combo, variety and four shooter badges), each with its own emblem and an unlock celebration.
- **Help page** — "how it works" explains every mode, the WPM maths, the shooter, power-ups and achievements.

### Clacks & the store
- **Clacks** are earned by playing: ~1 per 25 correct characters in a typing run (15s / 10 words minimum),
  1 per 20 shooter points, +20 for the daily (plus a daily-streak bonus), +15 for a new personal best, and a one-off
  reward for every badge.
- The **store** sells shooter **ships** (Dart, Stealth Wing, Saucer, Pixel, Comet, Obsidian) and bullet **trails**
  (Dotted, Laser, Plasma, Ember, Rainbow), each with a live animated preview. Some also need a badge.
  Everything is cosmetic — nothing changes your score.

### Polish
- **Light and dark** themes.
- Fully **responsive** — works from desktop down to phones, including on-screen-keyboard support on touch devices.

## Run it

It's a static page — just open the file:

```bash
open index.html   # or double-click it
```

Or serve it locally:

```bash
python -m http.server 8000
```

then visit `http://localhost:8000`.

## Deploy (GitHub Pages)

Because it's a single static file, you can host it for free:

1. Push to GitHub (already done).
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source: Deploy from a branch**, **Branch: `main`**, **Folder: `/ (root)`**, and Save.
4. After a minute it's live at `https://<user>.github.io/clack/`.

## Storage

All progress is stored locally in your browser via `localStorage` — nothing is sent anywhere:

- `clack_activity` — daily activity that drives the heatmap
- `clack_stats` — per-key accuracy, WPM history, personal bests, achievements, modes tried, daily results, clacks and store items
- `clack_theme` — light / dark preference
- `clack_mods` — punctuation / numbers toggles
- `clack_sound` — sound & haptics on/off

Progress is per browser, per device — there are no accounts, so it doesn't sync between devices.

Clearing your browser's site data resets everything.

## Tech

Vanilla HTML/CSS/JS in one file. Monospace type (JetBrains Mono via Google Fonts), Web Audio for sound, `<canvas>` for the shooter and the WPM chart, `localStorage` for persistence, CSS custom properties for theming.

## License

MIT — see [LICENSE](LICENSE).
