#!/usr/bin/env python3
"""
import-overrides.py - Import translations from flyto-cloud local-overrides.js

This script parses the local-overrides.js file and imports translations
into the corresponding flyto-i18n locale files.

Usage:
    python scripts/import-overrides.py [--cloud-path PATH] [--dry-run]
"""

import argparse
import json
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
LOCALES_DIR = PROJECT_ROOT / 'locales'
CLOUD_DIR = LOCALES_DIR / 'cloud'


def parse_js_object(content: str) -> dict:
    """
    Parse JavaScript object from local-overrides.js content.
    Converts JS object syntax to valid JSON.
    """
    match = re.search(r'export const localOverrides\s*=\s*(\{[\s\S]*?\n\})\s*\n\n', content)
    if not match:
        match = re.search(r'export const localOverrides\s*=\s*(\{[\s\S]*?\n\})', content)

    if not match:
        print("Error: Could not find localOverrides object")
        return {}

    js_obj = match.group(1)

    lines = js_obj.split('\n')
    result_lines = []

    for line in lines:
        kv_match = re.match(r"^(\s*)(['\"]?\w+(?:-\w+)?['\"]?)\s*:\s*'((?:[^'\\]|\\.)*)'(,?)$", line)
        if kv_match:
            indent = kv_match.group(1)
            key = kv_match.group(2)
            value = kv_match.group(3)
            comma = kv_match.group(4)

            if not key.startswith('"') and not key.startswith("'"):
                key = f'"{key}"'
            else:
                key = key.replace("'", '"')

            value = value.replace("\\'", "'")
            value = value.replace('"', '\\"')

            result_lines.append(f'{indent}{key}: "{value}"{comma}')
        else:
            converted = line
            converted = re.sub(r"'([^']+)':", r'"\1":', converted)
            converted = re.sub(r'(\s)(\w+):', r'\1"\2":', converted)
            result_lines.append(converted)

    json_str = '\n'.join(result_lines)
    json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)

    try:
        return json.loads(json_str)
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON: {e}")
        lines = json_str.split('\n')
        line_no = e.lineno - 1
        print(f"Near line {e.lineno}:")
        for i in range(max(0, line_no - 2), min(len(lines), line_no + 3)):
            marker = ">>> " if i == line_no else "    "
            print(f"{marker}{i+1}: {lines[i]}")
        return {}


def flatten_dict(d: dict, prefix: str = '') -> dict:
    """Flatten nested dict to dot-separated keys."""
    items = {}
    for k, v in d.items():
        new_key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            items.update(flatten_dict(v, new_key))
        else:
            items[new_key] = str(v)
    return items


def update_locale_files(locale: str, translations: dict, dry_run: bool = False) -> tuple:
    """Update locale files with translations."""
    locale_dir = CLOUD_DIR / locale

    if not locale_dir.exists():
        print(f"  Warning: Locale directory not found: {locale_dir}")
        return 0, 0

    updated_count = 0
    file_count = 0

    # Group translations by category (first segment)
    by_category = {}
    for key, value in translations.items():
        parts = key.split('.')
        category = parts[0]
        if category not in by_category:
            by_category[category] = {}
        by_category[category][key] = value

    for category, cat_translations in by_category.items():
        file_path = locale_dir / f"{category}.json"

        if not file_path.exists():
            print(f"    Skipping {category}: no {category}.json file")
            continue

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception as e:
            print(f"    Error reading {file_path}: {e}")
            continue

        existing = data.get('translations', {})
        changes = 0

        for key, value in cat_translations.items():
            if not value:
                continue
            if key not in existing:
                existing[key] = value
                changes += 1
            elif existing[key] == '':
                existing[key] = value
                changes += 1
            elif existing[key] != value:
                existing[key] = value
                changes += 1

        if changes > 0:
            file_count += 1
            updated_count += changes

            if dry_run:
                print(f"    Would update {file_path.name}: {changes} translations")
            else:
                data['translations'] = dict(sorted(existing.items()))
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                    f.write('\n')
                print(f"    Updated {file_path.name}: {changes} translations")

    return file_count, updated_count


def main():
    parser = argparse.ArgumentParser(
        description='Import translations from flyto-cloud local-overrides.js'
    )
    parser.add_argument(
        '--cloud-path',
        default='../flyto-cloud',
        help='Path to flyto-cloud repo'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview changes without writing'
    )

    args = parser.parse_args()

    cloud_path = Path(args.cloud_path).resolve()
    overrides_file = cloud_path / 'src/ui/web/frontend/src/i18n/local-overrides.js'

    if not overrides_file.exists():
        print(f"Error: local-overrides.js not found at {overrides_file}")
        sys.exit(1)

    print(f"Importing from: {overrides_file}")
    print(f"Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    print("-" * 60)

    content = overrides_file.read_text(encoding='utf-8')
    overrides = parse_js_object(content)

    if not overrides:
        print("No translations found in local-overrides.js")
        sys.exit(1)

    total_files = 0
    total_updates = 0

    for locale, translations in overrides.items():
        print(f"\n[{locale}]")

        flat = flatten_dict(translations)
        print(f"  Found {len(flat)} translations in overrides")

        files, updates = update_locale_files(locale, flat, args.dry_run)
        total_files += files
        total_updates += updates

    print("\n" + "=" * 60)
    print("Summary:")
    print(f"  Files updated: {total_files}")
    print(f"  Translations imported: {total_updates}")
    print("=" * 60)

    if args.dry_run:
        print("\nRun without --dry-run to apply changes")
    else:
        print("\nNext steps:")
        print("  1. Run: python scripts/build-dist.py")
        print("  2. Commit and push")


if __name__ == '__main__':
    main()
