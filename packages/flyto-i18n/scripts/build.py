#!/usr/bin/env python3
"""
build.py - Build merged locale files for distribution

Usage:
    python scripts/build.py [--locale LOCALE] [--output DIR]

Options:
    --locale    Build specific locale (default: all)
    --output    Output directory (default: dist/)
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Dict

PROJECT_ROOT = Path(__file__).parent.parent
LOCALES_DIR = PROJECT_ROOT / 'locales'
DIST_DIR = PROJECT_ROOT / 'dist'

# All project directories
PROJECT_DIRS = ['cloud', 'modules', 'landing', 'shared', 'app', 'code', 'console', 'data']


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


def merge_locale_files(locale: str) -> Dict[str, str]:
    """Merge all translation files for a locale into a single dict."""
    merged = {}

    for proj in PROJECT_DIRS:
        locale_dir = LOCALES_DIR / proj / locale
        if not locale_dir.exists():
            continue

        for json_file in sorted(locale_dir.glob('*.json')):
            try:
                with open(json_file) as f:
                    data = json.load(f)
                    if 'translations' in data:
                        merged.update(data['translations'])
            except Exception as e:
                print(f"Warning: Could not load {json_file}: {e}")

    return merged


def build_locale(locale: str, output_dir: Path) -> Path:
    """Build a single merged locale file."""
    merged = merge_locale_files(locale)
    if not merged:
        print(f"Warning: No translations found for {locale}")
        return None

    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / f"{locale}.json"

    output = {
        "locale": locale,
        "version": get_manifest_version(),
        "key_count": len(merged),
        "translations": merged
    }

    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"Built {output_file}: {len(merged)} keys")
    return output_file


def get_manifest_version() -> str:
    """Get version from manifest.json."""
    manifest_path = PROJECT_ROOT / 'manifest.json'
    try:
        with open(manifest_path) as f:
            return json.load(f).get('version', '0.0.0')
    except:
        return '0.0.0'


def main():
    parser = argparse.ArgumentParser(description='Build merged locale files')
    parser.add_argument('--locale', '-l', help='Build specific locale')
    parser.add_argument('--output', '-o', default='dist', help='Output directory')
    args = parser.parse_args()

    output_dir = Path(args.output)
    if not output_dir.is_absolute():
        output_dir = PROJECT_ROOT / output_dir

    if args.locale:
        locales = [args.locale]
    else:
        locales = get_locales()

    print(f"Building {len(locales)} locale(s)...")

    built = []
    for locale in locales:
        result = build_locale(locale, output_dir)
        if result:
            built.append(result)

    print(f"\nDone! Built {len(built)} locale file(s) to {output_dir}")

    dist_manifest = {
        "version": get_manifest_version(),
        "locales": locales,
        "files": [f.name for f in built]
    }
    manifest_file = output_dir / 'manifest.json'
    with open(manifest_file, 'w') as f:
        json.dump(dist_manifest, f, indent=2)
    print(f"Created {manifest_file}")


if __name__ == '__main__':
    main()
