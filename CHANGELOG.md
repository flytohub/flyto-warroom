# Changelog

## 2026-07-01

- Closed the public Warroom CE release loop with a tracked frontend
  `.env.example`, feature matrix, public roadmap, AutoFix whitepaper,
  benchmark/evidence methodology, and demo seed workspace.
- Added `install/scripts/seed-demo-workspace.py` plus
  `install/demo-workspace.json` so CE users can validate or seed a local
  workspace that explains code/container/cloud/external/evidence/autofix.
- Extended release and CE-boundary audits so missing docs, seed assets, or CE
  env examples fail closed.
- Added `verify-fast` and wired CI to run the generated Warroom root verify
  loop.
