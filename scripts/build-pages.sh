#!/usr/bin/env bash
# Build the static site for GitHub Pages.
#
# Pages serves this app from a SUBPATH (…github.io/k9clone/), which breaks three things that work
# fine at a domain root. This script fixes all three so the build is reproducible rather than
# hand-patched:
#
#   1. Absolute head links. Expo rewrites the tags IT generates with experiments.baseUrl, but the
#      manifest and icon links written by hand in public/index.html pass through verbatim and would
#      404. They cannot simply be made relative: on a deep link like /k9clone/records a relative href
#      resolves against /k9clone/records/, which is wrong. So they are rewritten to carry the base.
#   2. Deep links. Pages has no SPA rewrite. A cold load of /k9clone/records finds no such file, so
#      404.html is a copy of index.html — Pages serves it, the app boots and the router reads the
#      real path. This also matters for the installed PWA, whose start_url is "records".
#   3. Jekyll. Pages runs Jekyll by default, and Jekyll SKIPS any directory starting with "_" —
#      which would silently drop the entire _expo/ bundle and serve a blank app. .nojekyll disables it.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE=$(node -e "console.log(require('./app.json').expo.experiments.baseUrl || '')")
if [ -z "$BASE" ]; then
  echo "✗ app.json has no expo.experiments.baseUrl — Pages needs one (e.g. \"/k9clone\")." >&2
  exit 1
fi
echo "▶ base URL: $BASE"

rm -rf dist
npx expo export --platform web

# 1. carry the base into the hand-written head links
node -e "
const fs = require('fs');
const base = process.argv[1];
const f = 'dist/index.html';
let h = fs.readFileSync(f, 'utf8');
const before = h;
h = h.replace(/(href|src)=\"\/(manifest\.webmanifest|icons\/)/g, (m, a, p) => a + '=\"' + base + '/' + p);
fs.writeFileSync(f, h);
const n = (before.match(/(href|src)=\"\/(manifest\.webmanifest|icons\/)/g) || []).length;
console.log('▶ rewrote ' + n + ' absolute head link(s) to ' + base);
" "$BASE"

# 2. SPA fallback for deep links and the installed PWA's start_url
cp dist/index.html dist/404.html

# 3. stop Jekyll eating _expo/
touch dist/.nojekyll

# Fail loudly rather than deploying a site that cannot boot.
grep -q "$BASE/_expo/static/js" dist/index.html || { echo "✗ bundle path missing the base URL" >&2; exit 1; }
grep -q "$BASE/manifest.webmanifest" dist/index.html || { echo "✗ manifest link missing the base URL" >&2; exit 1; }
[ -f dist/.nojekyll ] || { echo "✗ .nojekyll missing" >&2; exit 1; }
[ -f dist/404.html ] || { echo "✗ 404.html missing" >&2; exit 1; }

echo "✓ dist/ ready for Pages at $BASE"
