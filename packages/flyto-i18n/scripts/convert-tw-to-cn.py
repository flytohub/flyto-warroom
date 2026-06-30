#!/usr/bin/env python3
"""
convert-tw-to-cn.py - Convert zh-TW locale to zh-CN using OpenCC

Usage:
    python scripts/convert-tw-to-cn.py
    python scripts/convert-tw-to-cn.py --dry-run

Uses OpenCC tw2sp profile which handles:
- Traditional -> Simplified character conversion
- Taiwan -> Mainland vocabulary conversion

Requirements:
    pip install opencc-python-reimplemented
"""

import argparse
import json
import sys
from pathlib import Path

try:
    import opencc
except ImportError:
    print("Error: opencc not installed")
    print("Run: pip install opencc-python-reimplemented")
    sys.exit(1)

PROJECT_ROOT = Path(__file__).parent.parent
LOCALES_DIR = PROJECT_ROOT / 'locales'

# All project directories
PROJECT_DIRS = ['cloud', 'modules', 'landing', 'shared', 'app', 'code', 'console', 'data']

# Post-OpenCC vocabulary fixes
TW_TO_CN_VOCAB = [
    ('自订', '自定义'),
    ('范本', '模板'),
    ('网路', '网络'),
    ('帐号', '账号'),
    ('帐户', '账户'),
]


def apply_vocab_fixes(text: str) -> str:
    """Apply post-OpenCC vocabulary replacements."""
    for tw, cn in TW_TO_CN_VOCAB:
        text = text.replace(tw, cn)
    return text


def convert_value(cc: opencc.OpenCC, value):
    """Recursively convert string values."""
    if isinstance(value, str):
        return apply_vocab_fixes(cc.convert(value))
    elif isinstance(value, dict):
        return {k: convert_value(cc, v) for k, v in value.items()}
    elif isinstance(value, list):
        return [convert_value(cc, item) for item in value]
    return value


def main():
    parser = argparse.ArgumentParser(description='Convert zh-TW to zh-CN using OpenCC')
    parser.add_argument('--dry-run', action='store_true', help='Preview without writing')
    parser.add_argument('--force', action='store_true', help='Overwrite existing zh-CN files')
    parser.add_argument('--project', '-p', help='Convert specific project only')
    args = parser.parse_args()

    cc = opencc.OpenCC('tw2sp')

    projects = [args.project] if args.project else PROJECT_DIRS

    print(f"Converting zh-TW -> zh-CN")
    print(f"Mode: {'DRY RUN' if args.dry_run else ('FORCE' if args.force else 'NORMAL')}")
    print()

    total_converted = 0
    total_skipped = 0

    for proj in projects:
        tw_dir = LOCALES_DIR / proj / 'zh-TW'
        cn_dir = LOCALES_DIR / proj / 'zh-CN'

        if not tw_dir.exists():
            continue

        if not args.dry_run:
            cn_dir.mkdir(parents=True, exist_ok=True)

        tw_files = sorted(tw_dir.glob('*.json'))
        if not tw_files:
            continue

        print(f"[{proj}] {len(tw_files)} files")

        for tw_file in tw_files:
            cn_file = cn_dir / tw_file.name

            if cn_file.exists() and not args.force:
                print(f"  SKIP {tw_file.name} (already exists)")
                total_skipped += 1
                continue

            with open(tw_file, encoding='utf-8') as f:
                data = json.load(f)

            data['locale'] = 'zh-CN'

            if 'translations' in data:
                data['translations'] = convert_value(cc, data['translations'])

            if args.dry_run:
                print(f"  WOULD convert {tw_file.name}")
            else:
                with open(cn_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                    f.write('\n')
                print(f"  OK {tw_file.name}")

            total_converted += 1

    print()
    print(f"Done: {total_converted} converted, {total_skipped} skipped")


if __name__ == '__main__':
    main()
