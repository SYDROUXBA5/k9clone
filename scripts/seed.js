#!/usr/bin/env node
// Local mode: the app seeds itself on first run and via Profile → Developer → Reset demo data
// (with an optional record count, e.g. 1000 for the report test). This script only explains that;
// when EXPO_PUBLIC_DATA_MODE=supabase it will run the hosted seed (M1b).
const args = process.argv.slice(2);
const idx = args.indexOf('--records');
const n = idx >= 0 ? Number(args[idx + 1]) : 40;
const mode = process.env.EXPO_PUBLIC_DATA_MODE || 'local';
if (mode === 'supabase') {
  console.log('Supabase seed is not implemented yet (docs/DECISIONS.md #7). Nothing was changed.');
  process.exit(0);
}
console.log(`K9CLONE — local data mode.
Demo data lives on each device (browser IndexedDB / phone storage), so it cannot be seeded from the terminal.
Open the app (http://localhost:4787), sign in (docs/DEMO-LOGINS.md), then Profile → Developer → "Reset demo data"
and set the record count to ${n}. First run seeds the default department automatically (${n === 40 ? '~40 records' : `${n} records requested`}).`);
