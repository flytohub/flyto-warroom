#!/usr/bin/env python3
"""
sync_missing_i18n.py — populate locale files with all `tOr` keys
used in src-next that don't yet exist in code/en/code.json.

For each missing key the script:
  - en/code.json   gets {"code.NS.key": "<English fallback from code>"}
  - zh-TW / zh-CN / ja get {"code.NS.key": ""}    (empty placeholder)

Empty placeholders are what `translate-with-openai.py --target zh-TW
--project code` looks for; running it after this populates each
non-EN locale via GPT-4o. Until you run it, the frontend's tOr()
fallback (the same English text) still renders for non-EN locales
so nothing changes user-facing.

Idempotent — re-runs only touch keys that haven't been seen yet.

Usage:
    python3 scripts/sync_missing_i18n.py            # walk + report + write
    python3 scripts/sync_missing_i18n.py --dry-run  # report only
"""

import argparse
import json
import re
import sys
from pathlib import Path

# `import io` only needed when forcing stdout to UTF-8 on Windows.
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC = REPO_ROOT / 'src-next'
I18N_ROOT = REPO_ROOT.parent / 'flyto-i18n' / 'locales' / 'code'
LOCALES = ['en', 'zh-TW', 'zh-CN', 'ja']

# Matches: tOr('key.sub', 'English fallback')  — also tolerant of
# double quotes + line breaks inside the second argument.
TOR_PAT = re.compile(
    r"""tOr\(\s*['"]([a-zA-Z][a-zA-Z0-9._]+)['"]\s*(?:,\s*(?:'([^']+)'|"([^"]+)"))?""",
    re.DOTALL,
)

SKIP_DIRS = {'__tests__', '@fuse', '@auth', '@i18n', '@mock-utils'}

def walk_keys() -> dict[str, str]:
    """Return {key -> first-seen English fallback}."""
    out: dict[str, str] = {}
    for path in SRC.rglob('*.tsx'):
        s = str(path)
        if any(d in s for d in SKIP_DIRS):
            continue
        try:
            text = path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue
        for m in TOR_PAT.finditer(text):
            key = m.group(1)
            fb = (m.group(2) or m.group(3) or '').strip()
            if key not in out:
                out[key] = fb
            elif not out[key] and fb:
                # Upgrade a previously-empty fallback if a later
                # callsite supplies one.
                out[key] = fb
    return out

def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding='utf-8'))

def save(path: Path, data: dict) -> None:
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    used = walk_keys()
    print(f'[scan] {len(used)} unique tOr keys in src-next')

    # Build the diff vs en/code.json
    en_path = I18N_ROOT / 'en' / 'code.json'
    en_doc = load(en_path)
    en_trans = en_doc.setdefault('translations', {})

    missing = {k: v for k, v in used.items() if f'code.{k}' not in en_trans}
    print(f'[diff] {len(missing)} missing from en/code.json')

    if not missing:
        return 0

    # Group by namespace for reporting
    by_ns: dict[str, list[tuple[str, str]]] = {}
    for k, fb in missing.items():
        ns = k.split('.', 1)[0]
        by_ns.setdefault(ns, []).append((k, fb))
    print('[diff] top namespaces:')
    for ns in sorted(by_ns, key=lambda n: -len(by_ns[n]))[:15]:
        print(f'    {ns:24s} {len(by_ns[ns])}')

    if args.dry_run:
        print('[dry-run] no writes')
        return 0

    # Apply: en gets the fallback, other locales get empty strings.
    for loc in LOCALES:
        path = I18N_ROOT / loc / 'code.json'
        doc = load(path)
        trans = doc.setdefault('translations', {})
        added = 0
        for key, fb in missing.items():
            full = f'code.{key}'
            if full in trans:
                continue
            trans[full] = fb if loc == 'en' else ''
            added += 1
        save(path, doc)
        print(f'[write] {loc}: +{added}')

    print()
    print('Next: cd ../flyto-i18n')
    print('  python3 scripts/translate-with-openai.py --target zh-TW --project code')
    print('  python3 scripts/translate-with-openai.py --target zh-CN --project code')
    print('  python3 scripts/translate-with-openai.py --target ja    --project code')
    print('  python3 scripts/build-dist.py')
    print('  git add -A && git commit -m "feat(code): fill missing translations" && git push')
    return 0

if __name__ == '__main__':
    sys.exit(main())
