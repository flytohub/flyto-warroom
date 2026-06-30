#!/usr/bin/env python3
"""
build-app.py - Build flat merged locale files for flyto-app (Flutter)

Usage:
    python scripts/build-app.py

Merges shared(app, common) + cloud(template) keys into flat JSON
for the Flutter app's rootBundle.loadString() loader.

Output: ../flyto-app/assets/i18n/{locale}.json
"""

import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
LOCALES_DIR = PROJECT_ROOT / 'locales'
APP_DIR = PROJECT_ROOT.parent / 'flyto-app' / 'assets' / 'i18n'

# Which project dirs and files to include for the app
APP_SOURCES = [
    ('shared', ['app.json', 'common.json']),
    ('cloud', ['template.json']),
]

# Only build locales that the app supports
APP_LOCALES = ['en', 'zh-TW']


def build_app_locale(locale: str) -> dict:
    """Build flat merged translations for a locale."""
    flat = {}
    files_count = 0

    for project, file_filter in APP_SOURCES:
        locale_dir = LOCALES_DIR / project / locale
        if not locale_dir.exists():
            continue

        for json_file in sorted(locale_dir.glob('*.json')):
            if file_filter and json_file.name not in file_filter:
                continue

            with open(json_file, encoding='utf-8') as f:
                data = json.load(f)

            if 'translations' in data:
                flat.update(data['translations'])
                files_count += 1

    return {
        'locale': locale,
        'translations': flat
    }


def main():
    APP_DIR.mkdir(parents=True, exist_ok=True)

    for locale in APP_LOCALES:
        data = build_app_locale(locale)
        out_file = APP_DIR / f'{locale}.json'

        with open(out_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write('\n')

        key_count = len(data.get('translations', {}))
        print(f'  {locale}: {key_count} keys -> {out_file.relative_to(PROJECT_ROOT.parent)}')

    print('\nDone.')


if __name__ == '__main__':
    main()
