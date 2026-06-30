#!/usr/bin/env python3
"""
add-cloud-keys.py - Add missing flyto-cloud translation keys to i18n

Scans flyto-cloud frontend for $t('key') and t('key') calls,
finds keys not in the i18n source, and adds them with English
translations generated from key names.
"""

import re
import json
import sys
from pathlib import Path
from collections import defaultdict

PROJECT_ROOT = Path(__file__).parent.parent
CLOUD_SRC = PROJECT_ROOT.parent / 'flyto-cloud' / 'src' / 'ui' / 'web' / 'frontend' / 'src'
CLOUD_LOCALES = PROJECT_ROOT / 'locales' / 'cloud'
DIST_FILE = PROJECT_ROOT / 'dist' / 'cloud' / 'en.json'

# Regex patterns
PAT_DOLLAR_T = re.compile(r"""\$t\(['"]([^'"]+)['"]\s*[,)]""")
PAT_T = re.compile(r"""(?<![.\w])t\(['"]([^'"]+)['"]\s*[,)]""")

SCAN_EXTS = {'.vue', '.js', '.ts', '.jsx', '.tsx'}

# Dynamic key prefixes to skip
DYNAMIC_PREFIXES = ['modules.']


def flatten(obj, prefix=''):
    result = {}
    for k, v in obj.items():
        fk = f'{prefix}.{k}' if prefix else k
        if isinstance(v, dict):
            result.update(flatten(v, fk))
        else:
            result[fk] = v
    return result


def extract_keys():
    """Extract all translation keys from flyto-cloud frontend."""
    keys = set()
    for ext in SCAN_EXTS:
        for f in CLOUD_SRC.rglob(f'*{ext}'):
            rel = str(f)
            if 'node_modules' in rel or 'i18n/bundled' in rel:
                continue
            try:
                content = f.read_text(encoding='utf-8')
            except Exception:
                continue

            for pattern in [PAT_DOLLAR_T, PAT_T]:
                for m in pattern.finditer(content):
                    key = m.group(1)
                    if any(c in key for c in '{$`('):
                        continue
                    if key.endswith('.'):
                        continue
                    keys.add(key)
    return keys


def key_to_english(key):
    """Convert key name to readable English."""
    parts = key.split('.')
    last = parts[-1]
    words = re.sub(r'([a-z])([A-Z])', r'\1 \2', last)
    words = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1 \2', words)
    return words[0].upper() + words[1:] if words else last


def main():
    if not CLOUD_SRC.exists():
        print(f"Error: flyto-cloud frontend src not found at {CLOUD_SRC}")
        sys.exit(1)

    print("Scanning flyto-cloud frontend for translation keys...")
    code_keys = extract_keys()
    print(f"  Found {len(code_keys)} unique keys in code")

    # Get existing keys from dist
    with open(DIST_FILE, encoding='utf-8') as f:
        data = json.load(f)
    existing = set(flatten(data.get('translations', {})).keys())
    print(f"  Existing keys in dist: {len(existing)}")

    # Find orphaned
    orphaned = set()
    for key in code_keys:
        if any(key.startswith(p) for p in DYNAMIC_PREFIXES):
            continue
        if key not in existing:
            orphaned.add(key)

    print(f"  Orphaned keys: {len(orphaned)}")

    if not orphaned:
        print("\nNo new keys to add!")
        return

    # Group by category (first segment)
    by_category = defaultdict(dict)
    for key in sorted(orphaned):
        parts = key.split('.')
        category = parts[0]
        by_category[category][key] = key_to_english(key)

    print(f"\nKeys by category:")
    for cat, keys in sorted(by_category.items()):
        print(f"  {cat}: {len(keys)} keys")

    # Add to every existing cloud locale. Non-English locales intentionally get
    # empty values, matching sync-locales.py behavior and keeping missing
    # translations visible to coverage while preventing runtime orphan keys.
    total_added = 0
    locales = sorted(path.name for path in CLOUD_LOCALES.iterdir() if path.is_dir())
    for locale in locales:
        locale_dir = CLOUD_LOCALES / locale

        for category, translations in sorted(by_category.items()):
            cat_file = locale_dir / f'{category}.json'

            if cat_file.exists():
                with open(cat_file, encoding='utf-8') as f:
                    cat_data = json.load(f)
            else:
                cat_data = {
                    "$schema": "../../../schema/locale.schema.json",
                    "locale": locale,
                    "category": f"cloud.{category}",
                    "version": "1.0.0",
                    "translations": {}
                }

            existing_trans = cat_data['translations']
            added = 0
            for key, eng_value in translations.items():
                if key not in existing_trans:
                    # For non-en locales, add empty string
                    existing_trans[key] = eng_value if locale == 'en' else ''
                    added += 1

            if added > 0:
                cat_data['translations'] = dict(sorted(existing_trans.items()))
                locale_dir.mkdir(parents=True, exist_ok=True)
                with open(cat_file, 'w', encoding='utf-8') as f:
                    json.dump(cat_data, f, indent=2, ensure_ascii=False)
                    f.write('\n')
                print(f"  [{locale}] {category}.json: +{added} keys")
                total_added += added

    print(f"\nTotal added: {total_added}")
    print(f"\nNext steps:")
    print(f"  1. Run: python scripts/sync-locales.py")
    print(f"  2. Run: python scripts/build-dist.py")


if __name__ == '__main__':
    main()
