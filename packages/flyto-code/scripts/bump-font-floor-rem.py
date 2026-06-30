#!/usr/bin/env python3
"""bump-font-floor-rem.py — second-pass codemod.

The first bump-font-floor pass missed string-rem-unit font sizes
(`fontSize: '0.7rem'`, `'0.75rem'`, `'0.8rem'`) because the regex only
caught integer pixel literals. This pass picks those up.

Also catches `#f87171` (rose-400) and `#fca5a5` (rose-300) — both are
near-red shades that should snap to the canonical severity red
`#ef4444`. Audit identified ~5 inline uses spread across red_team /
APIDiscoveryTab / PreviewModal.

Idempotent — running twice is a no-op.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent / 'src-next'

RULES = [
    # fontSize string-rem floor: 0.7/0.75rem (≈11/12px) → 12px,
    # 0.8rem (≈13px) → 13px. Inline px keeps the unit small but
    # consistent with the rest of the codebase (which uses ints).
    (re.compile(r"fontSize:\s*['\"]0\.7rem['\"]"),  "fontSize: 12"),
    (re.compile(r"fontSize:\s*['\"]0\.75rem['\"]"), "fontSize: 12"),
    (re.compile(r"fontSize:\s*['\"]0\.8rem['\"]"),  "fontSize: 13"),

    # Rose-400 / rose-300 → severity-red. Inline string + JSX prop variants.
    (re.compile(r"'#f87171'"), "'#ef4444'"),
    (re.compile(r'"#f87171"'), '"#ef4444"'),
    (re.compile(r"'#fca5a5'"), "'#ef4444'"),
    (re.compile(r'"#fca5a5"'), '"#ef4444"'),
]


def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'components' / 'compounds'
    changed = 0
    edits = 0
    for fp in target.rglob('*.tsx'):
        original = fp.read_text(encoding='utf-8')
        modified = original
        local = 0
        for pat, rep in RULES:
            modified, n = pat.subn(rep, modified)
            local += n
        if local == 0:
            continue
        edits += local
        changed += 1
        rel = fp.relative_to(ROOT.parent)
        print(f'  {rel}: {local} edit(s)')
        fp.write_text(modified, encoding='utf-8')
    print(f'\n{changed} files, {edits} edits')
    return 0


if __name__ == '__main__':
    sys.exit(main())
