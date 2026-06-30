#!/usr/bin/env python3
"""
add-code-keys.py - Add missing flyto-code translation keys to i18n

Scans flyto-code/src for t('key') and tOr('key', 'fallback') calls,
finds keys that don't exist in the i18n source, and adds them with
English translations extracted from tOr fallbacks or generated from
key names.
"""

import re
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
# flyto-code's live application migrated from src/ to src-next/. Keep this
# scanner aligned with flyto-code/scripts/check-i18n.py so newly added UI keys
# are added to source translations instead of being hidden in an allowlist.
CODE_SRC = PROJECT_ROOT.parent / 'flyto-code' / 'src-next'
I18N_FILE = PROJECT_ROOT / 'locales' / 'code' / 'en' / 'code.json'
DIST_FILE = PROJECT_ROOT / 'dist' / 'code' / 'en.json'

# Regex patterns
PAT_T = re.compile(r"(?<![.\w])t\(['\"]([^'\"]+)['\"]")
PAT_TOR = re.compile(r"(?<![.\w])tOr\(['\"]([^'\"]+)['\"],\s*['\"]([^'\"]*)['\"]")
PAT_TOR_ANY = re.compile(r"(?<![.\w])tOr\(['\"]([^'\"]+)['\"]\s*,")

SCAN_EXTS = {'.ts', '.tsx', '.js', '.jsx'}

# Keys to skip (test/dummy keys from test files that leak through)
SKIP_KEYS = {
    'key', 'label', 'missing', 'missing.key', 'msg',
    'nonexistent.key', 'x', 'hello', 'greeting',
}


def flatten(obj, prefix=''):
    """Flatten nested dict to dot-separated keys."""
    result = {}
    for k, v in obj.items():
        fk = f'{prefix}.{k}' if prefix else k
        if isinstance(v, dict):
            result.update(flatten(v, fk))
        else:
            result[fk] = v
    return result


def extract_keys_from_code():
    """Extract all t()/tOr() calls from flyto-code source."""
    keys = {}  # key -> fallback or None

    for ext in SCAN_EXTS:
        for f in CODE_SRC.rglob(f'*{ext}'):
            rel = str(f)
            if 'node_modules' in rel:
                continue
            if '__tests__' in rel or '.test.' in f.name:
                continue

            try:
                content = f.read_text(encoding='utf-8')
            except Exception:
                continue

            # tOr first (has fallback text)
            for m in PAT_TOR.finditer(content):
                key = m.group(1)
                fallback = m.group(2)
                if any(c in key for c in '{$`('):
                    continue
                keys[key] = fallback

            for m in PAT_TOR_ANY.finditer(content):
                key = m.group(1)
                if any(c in key for c in '{$`('):
                    continue
                keys.setdefault(key, None)

            for m in PAT_T.finditer(content):
                key = m.group(1)
                if any(c in key for c in '{$`('):
                    continue
                if key.endswith('.'):
                    continue
                if key not in keys:
                    keys[key] = None

    return keys


def key_to_english(key, fallback):
    """Convert a key name to English text."""
    if fallback:
        return fallback

    parts = key.split('.')
    last = parts[-1]

    # camelCase to words
    words = re.sub(r'([a-z])([A-Z])', r'\1 \2', last)
    words = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1 \2', words)

    return words[0].upper() + words[1:] if words else last


def get_existing_keys():
    """Get keys already in dist."""
    with open(DIST_FILE, encoding='utf-8') as f:
        data = json.load(f)

    avail = set()
    for k in flatten(data.get('translations', {})):
        stripped = k.removeprefix('code.')
        avail.add(stripped)

    return avail


def main():
    if not CODE_SRC.exists():
        print(f"Error: flyto-code/src not found at {CODE_SRC}")
        sys.exit(1)

    print("Scanning flyto-code/src for translation keys...")
    code_keys = extract_keys_from_code()
    print(f"  Found {len(code_keys)} unique keys in code")

    existing = get_existing_keys()
    print(f"  Existing keys in dist: {len(existing)}")

    # Find missing keys
    new_translations = {}
    skipped = []
    for key in sorted(code_keys):
        if key in SKIP_KEYS:
            skipped.append(key)
            continue
        if key in existing:
            continue
        if key.startswith('modules.'):
            continue

        english = key_to_english(key, code_keys[key])
        i18n_key = f'code.{key}'
        new_translations[i18n_key] = english

    print(f"\n  New keys to add: {len(new_translations)}")
    if skipped:
        print(f"  Skipped test/dummy keys: {skipped}")

    if not new_translations:
        print("\nNo new keys to add!")
        return

    # Show preview
    print("\nPreview (first 20):")
    for i, (k, v) in enumerate(list(new_translations.items())[:20]):
        has_fallback = '(from tOr)' if code_keys.get(k.removeprefix('code.')) else '(generated)'
        print(f"  {k}: {v[:60]}{'...' if len(v) > 60 else ''} {has_fallback}")
    if len(new_translations) > 20:
        print(f"  ... and {len(new_translations) - 20} more")

    # Merge into i18n file
    print(f"\nMerging into {I18N_FILE}...")
    with open(I18N_FILE, encoding='utf-8') as f:
        i18n_data = json.load(f)

    translations = i18n_data['translations']
    before = len(translations)

    added = 0
    for k, v in new_translations.items():
        if k not in translations:
            translations[k] = v
            added += 1

    i18n_data['translations'] = dict(sorted(translations.items()))

    with open(I18N_FILE, 'w', encoding='utf-8') as f:
        json.dump(i18n_data, f, indent=2, ensure_ascii=False)
        f.write('\n')

    print(f"  Before: {before} keys")
    print(f"  Added: {added} keys")
    print(f"  After: {len(i18n_data['translations'])} keys")
    print(f"\nDone! Next steps:")
    print(f"  1. Review the new keys in {I18N_FILE}")
    print(f"  2. Run: python scripts/sync-locales.py --project code")
    print(f"  3. Run: python scripts/build-dist.py")


if __name__ == '__main__':
    main()
