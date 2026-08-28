# K9CLONE

Record keeping for a police K9 unit — training, deployments, classes, vet visits and GPS tracking —
as one Expo codebase that runs on iPhone, Android, in a browser, and as an installable desktop app.

**Try it: [sydrouxba5.github.io/k9clone](https://sydrouxba5.github.io/k9clone/)**
Sign in with `mia@demo.k9` / `demo`. It installs to your home screen and works offline.

> Everything runs on your device. There is no server and no account — the demo data lives in your
> browser's own storage, and nothing you type leaves your phone or laptop.

---

## Demo accounts

All use the password `demo`. The seeded department is **Ashcombe PD**.

| Login | Role | See this |
|---|---|---|
| `mia@demo.k9` | Handler | The main account — two dogs and most of the seeded records |
| `theo@demo.k9` | Handler | A second handler in the same training group |
| `priya@demo.k9` | Handler + Trainer | Switch role from the menu to get the trainer's view |
| `sgt.cole@demo.k9` | Supervisor | The review queue, the whole unit's records, and billing |
| `lt.marsh@demo.k9` | Supervisor | A *different* department — sees nothing of Ashcombe until something is shared |

Reset the data any time: **Profile → Developer → Reset demo data**.

Because storage is per-device and per-browser, each of those accounts sees its own copy. Signing in as
a supervisor shows you a supervisor's world, not a live view of what another person just typed.

## What it does

- **Records hub** — a three-month calendar, a TO DO card, filters that survive as removable chips, and
  saved searches
- **Training** — patrol and detection exercises, per-dog completions, odour placements, automatic
  weather at the time and place of the exercise
- **Deployments** — call-outs, finds, seizures, arrests, and the narrative
- **GPS tracking** — lay a track, follow one, drop photo pins; a supervisor watches live tracks on a
  map. Someone with no account can lay a track from a code
- **Reports** — printable full records and summaries, PDF via the browser's print dialog, plus CSV
- **Vet and vaccinations**, **statistics**, **groups and sharing**, and a **review loop** where a
  supervisor approves or rejects a handler's record

Dark mode, a real seat/subscription model, and every screen built to work one-handed on a phone as
well as on a desktop.

## Running it locally

```bash
npm install
npm start
```

That serves the browser build on <http://localhost:4787> and prints a QR code — scan it with
[Expo Go](https://expo.dev/go) to run it natively on your phone.

To rebuild the published site:

```bash
npm run build:pages
```

The script exists because GitHub Pages serves the app from a subpath, which breaks absolute asset
paths, single-page deep links, and any directory beginning with `_`. It handles all three.

## Honest limits

- **No backend.** Records live in the browser's own storage. Word/Excel export, emailed reports and
  Microsoft sign-in all need a server and are not implemented — the UI says so where it applies.
- **iOS and Android are verified as a build, not as a device run.** The code bundles cleanly for
  native and no web-only API is reachable from a phone, but it has not been run on real hardware.
- **Not affiliated with, or endorsed by, any existing product.** This is an independent
  implementation written from a feature list; no third-party code, assets, branding or copy was used.

## Stack

Expo SDK 57 · React Native 0.86 · React 19.2 · expo-router · TypeScript (strict) · react-native-web.
Data sits behind a `Repository` interface, so the on-device store can be swapped for a hosted database
without touching a screen. Weather from Open-Meteo; Leaflet on the web and react-native-maps on a phone.

---

Personal project — all rights reserved. Published so it can be tried, not as a licensed release.
