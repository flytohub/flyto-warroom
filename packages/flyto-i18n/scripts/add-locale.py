#!/usr/bin/env python3
"""
add-locale.py - Add a new locale based on English

Usage:
    python scripts/add-locale.py ja          # Add Japanese
    python scripts/add-locale.py ko          # Add Korean
    python scripts/add-locale.py --list      # List available locales

This script:
1. Creates new locale directories under each project
2. Copies all English files with empty values (or English as placeholder)
3. Maintains the same structure as English base
"""

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
LOCALES_DIR = PROJECT_ROOT / 'locales'

# All project directories
PROJECT_DIRS = ['cloud', 'modules', 'landing', 'shared', 'app', 'code', 'console', 'data']

# Common locale codes
LOCALE_NAMES = {
    'en': 'English',
    'zh-TW': 'Traditional Chinese',
    'zh-CN': 'Simplified Chinese',
    'ja': 'Japanese',
    'ko': 'Korean',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'pt': 'Portuguese',
    'it': 'Italian',
    'ru': 'Russian',
    'ar': 'Arabic',
    'th': 'Thai',
    'vi': 'Vietnamese',
}


def get_locales() -> list:
    """Get available locales by scanning project directories."""
    locales = set()
    for proj in PROJECT_DIRS:
        proj_dir = LOCALES_DIR / proj
        if proj_dir.exists():
            for d in proj_dir.iterdir():
                if d.is_dir():
                    locales.add(d.name)
    return sorted(locales)


def add_locale(locale: str, use_english_values: bool = False):
    """Add a new locale based on English."""
    # Check if locale already exists in any project
    for proj in PROJECT_DIRS:
        if (LOCALES_DIR / proj / locale).exists():
            print(f"Locale '{locale}' already exists in {proj}/")
            return False

    files_created = 0
    total_keys = 0

    for proj in PROJECT_DIRS:
        en_dir = LOCALES_DIR / proj / 'en'
        if not en_dir.exists():
            continue

        target_dir = LOCALES_DIR / proj / locale
        target_dir.mkdir(parents=True, exist_ok=True)

        for en_file in sorted(en_dir.glob('*.json')):
            with open(en_file, encoding='utf-8') as f:
                data = json.load(f)

            data['locale'] = locale

            if 'translations' in data:
                if not use_english_values:
                    data['translations'] = {k: "" for k in data['translations'].keys()}
                total_keys += len(data['translations'])

            target_file = target_dir / en_file.name
            with open(target_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            files_created += 1
            print(f"  Created {proj}/{locale}/{en_file.name}")

    print()
    print(f"Locale '{locale}' created successfully!")
    print(f"   Files: {files_created}")
    print(f"   Keys: {total_keys} (empty)")
    print()
    print(f"Next steps:")
    print(f"  1. Translate the files in locales/*/'{locale}/")
    print(f"  2. Run: python scripts/sync-locales.py")
    print(f"  3. Commit and push")

    return True


def count_locale_translations(locale: str) -> tuple[int, int]:
    """Count translated and total keys for a locale."""
    keys = 0
    translated = 0

    for proj in PROJECT_DIRS:
        locale_dir = LOCALES_DIR / proj / locale
        if not locale_dir.exists():
            continue
        for path in locale_dir.glob('*.json'):
            with open(path, encoding='utf-8') as fp:
                data = json.load(fp)
            translations = data.get('translations', {})
            keys += len(translations)
            translated += sum(1 for value in translations.values() if value)

    return translated, keys


def locale_status(translated: int, keys: int) -> tuple[str, float]:
    """Return display status and percent complete for a locale."""
    pct = (translated / keys * 100) if keys > 0 else 0
    if pct == 100:
        return "OK", pct
    if pct > 0:
        return "WIP", pct
    return "EMPTY", pct


def list_locales():
    """List all available locales."""
    print("Available locales:")
    print()

    for locale in get_locales():
        translated, keys = count_locale_translations(locale)
        status, pct = locale_status(translated, keys)
        name = LOCALE_NAMES.get(locale, '')

        print(f"  [{status:5}] {locale:8} {name:25} {translated:5}/{keys:5} ({pct:.1f}%)")

    print()
    print("To add a new locale: python scripts/add-locale.py <locale_code>")


def main():
    parser = argparse.ArgumentParser(description='Add a new locale')
    parser.add_argument('locale', nargs='?', help='Locale code (e.g., ja, ko, es)')
    parser.add_argument('--list', '-l', action='store_true', help='List available locales')
    parser.add_argument('--with-english', '-e', action='store_true',
                        help='Use English values as placeholders instead of empty strings')
    args = parser.parse_args()

    if args.list or not args.locale:
        list_locales()
        return

    locale = args.locale
    print(f"Adding new locale: {locale}")
    if locale in LOCALE_NAMES:
        print(f"Language: {LOCALE_NAMES[locale]}")
    print()

    add_locale(locale, use_english_values=args.with_english)


if __name__ == '__main__':
    main()
