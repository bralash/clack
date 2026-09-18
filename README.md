# Clack

A minimalistic typing test — a web app inspired by the Bemonkey iOS app, built as a single self-contained `index.html` (no build step, no dependencies).

## Features

- **Typing test** — `#time` (15/30/60/120/180s) and `#words` (10/25/50/100) modes. One word at a time, and it **auto-advances** the instant you finish a word (right *or* wrong) so nothing interrupts your flow.
- **Shooter mode** (`#shoot`) — a ZType-style typing game: words drift toward your ship, type one to lock on and fire, destroy it before it reaches the base. Difficulties: `calm` / `normal` / `frenzy`.
- **Contribution heatmap** — a GitHub-style year graph of your real daily activity, with day-streak and monthly word/time totals. Fills in as you actually type.
- **Feel** — a soft mechanical key-click and a dull error thud (Web Audio, toggleable, with haptics), a caret that pulses with your rhythm, a shake on errors and a glow when you nail a word, and a faint live-WPM readout that rises as you type.
- **Stats page** — a per-key accuracy heatmap (which keys you fumble most), a WPM-over-time chart, and personal bests per mode with a celebration when you beat one.

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

## Storage

All progress is stored locally in your browser via `localStorage`:

- `bemonkey_v3` — daily activity that drives the heatmap
- `clack_stats` — per-key accuracy, WPM history, and personal bests
- `bm_sound` — sound/haptics on/off

Nothing is sent anywhere; clearing your browser's site data resets it.

## Tech

Vanilla HTML/CSS/JS. Monospace type (JetBrains Mono via Google Fonts), Web Audio for sound, `<canvas>` for the shooter and the WPM chart. Dark, gold-accented theme.
