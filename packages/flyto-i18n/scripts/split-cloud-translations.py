#!/usr/bin/env python3
"""
split-cloud-translations.py - Split flyto-cloud UI translations into category files

This script splits the monolithic en.json/zh-TW.json into separate files by page/feature,
making translations easier to manage and update.

Usage:
    python scripts/split-cloud-translations.py --cloud-path PATH [--dry-run]
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List

# Grouping by page/feature
TRANSLATION_GROUPS = {
    'common': [
        'languageSwitcher', 'common', 'accessibility', 'confirmDialog',
        'validation', 'errors', 'error', 'message', 'notification',
        'notifications', 'footer', 'actionLabel', 'time', 'status',
        'alt', 'aria', 'privacy', 'terms', 'cookies', 'language', 'nav'
    ],
    'auth': ['auth', 'login', 'loginFormDefault', 'changePassword'],
    'dashboard': ['dashboard', 'dashboardPage', 'home'],
    'template': [
        'template', 'templateBuilder', 'templateCard', 'templateDetail',
        'templateForm', 'templateRunner', 'templateToolbar', 'templateDebugger',
        'templateCategory', 'createModal'
    ],
    'workflow': [
        'workflow', 'workflowCanvas', 'workflowEditor', 'workflowNode',
        'workflowStepDefinitions', 'workflowsPage', 'flow'
    ],
    'marketplace': [
        'marketplace', 'marketplacePage', 'marketplaceCategory',
        'publish', 'publishPage', 'publishTab', 'visibility',
        'accessLevel', 'pricingType', 'currency', 'quota'
    ],
    'modules': [
        'modules', 'moduleCard', 'moduleCategory', 'moduleLab',
        'component', 'componentDefault', 'componentDefinitions'
    ],
    'tools': ['toolLibrary', 'toolRunner', 'simpleToolView', 'toolCategory'],
    'plugins': [
        'plugins', 'pluginStatus', 'pluginType',
        'pluginCapability', 'pluginTask'
    ],
    'settings': ['settings', 'userSettings', 'payoutSettings'],
    'admin': [
        'admin', 'inviteKeys', 'organization',
        'projects', 'roles', 'audit'
    ],
    'ai': ['llmChain', 'vectorStore', 'aiAgent', 'huggingface', 'chat'],
    'execution': [
        'execution', 'executionModal', 'terminal', 'batch',
        'checkpoint', 'checkpointTooltip', 'completionEffect',
        'errorStrategy', 'backoffType', 'errorWorkflow'
    ],
    'debug': [
        'debug', 'debugTab', 'replayMode', 'breakpoint', 'container',
        'observability', 'metrics', 'alerts', 'traces'
    ],
    'forms': [
        'form', 'autoForm', 'preview', 'variableSelector', 'bindings',
        'outputs', 'testStep', 'valueSource', 'expression', 'code', 'variables'
    ],
    'recorder': ['recorder', 'recorderAction'],
    'triggers': ['triggers', 'cronPreset'],
    'http': ['http', 'report'],
    'ui': [
        'gridLayout', 'uiRenderer', 'dynamicUITest',
        'switchCase', 'node', 'subflow'
    ],
    'payment': ['payment', 'orders'],
    'system': [
        'coreUpdate', 'updateNotification', 'offline',
        'license', 'upgrade', 'versions', 'credentials'
    ],
    'creatorProfile': ['creatorProfile'],
}


def split_translations(data: Dict, groups: Dict[str, List[str]]) -> Dict[str, Dict]:
    """Split translation data into groups."""
    result = {}
    assigned = set()

    for group_name, keys in groups.items():
        group_data = {}
        for key in keys:
            if key in data:
                group_data[key] = data[key]
                assigned.add(key)
        if group_data:
            result[group_name] = group_data

    # Handle unassigned keys
    unassigned = set(data.keys()) - assigned
    if unassigned:
        result['other'] = {k: data[k] for k in sorted(unassigned)}

    return result


def main():
    parser = argparse.ArgumentParser(description='Split cloud translations')
    parser.add_argument('--cloud-path', default='../flyto-cloud',
                        help='Path to flyto-cloud')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show changes without writing')
    args = parser.parse_args()

    cloud_path = Path(args.cloud_path).resolve()
    i18n_path = cloud_path / 'src' / 'ui' / 'web' / 'frontend' / 'src' / 'i18n'
    locales_path = i18n_path / 'locales'

    if not locales_path.exists():
        print(f"Error: Locales directory not found: {locales_path}")
        sys.exit(1)

    # Process each locale
    for locale_file in ['en.json', 'zh-TW.json']:
        source_file = locales_path / locale_file
        if not source_file.exists():
            print(f"Skipping {locale_file} (not found)")
            continue

        locale_code = locale_file.replace('.json', '')
        output_dir = locales_path / locale_code

        print(f"\n{'=' * 50}")
        print(f"Processing {locale_file}")
        print(f"{'=' * 50}")

        with open(source_file) as f:
            data = json.load(f)

        # Split into groups
        grouped = split_translations(data, TRANSLATION_GROUPS)

        if args.dry_run:
            print(f"Would create {len(grouped)} files in {output_dir}/")
            for group_name, group_data in sorted(grouped.items()):
                key_count = sum(
                    len(v) if isinstance(v, dict) else 1
                    for v in group_data.values()
                )
                print(f"  {group_name}.json: {len(group_data)} sections, ~{key_count} keys")
        else:
            output_dir.mkdir(parents=True, exist_ok=True)

            for group_name, group_data in grouped.items():
                output_file = output_dir / f"{group_name}.json"
                with open(output_file, 'w') as f:
                    json.dump(group_data, f, indent=2, ensure_ascii=False)
                print(f"  Created {output_file.name}")

            print(f"\nCreated {len(grouped)} files in {output_dir}/")

    # Generate index.js template if not dry-run
    if not args.dry_run:
        print("\n" + "=" * 50)
        print("Next steps:")
        print("=" * 50)
        print("""
1. Update i18n/index.js to load from split files:

   // Before (single file)
   import en from './locales/en.json'

   // After (merged from split files)
   const enModules = import.meta.glob('./locales/en/*.json', { eager: true })
   const en = Object.values(enModules).reduce((acc, mod) => {
     return { ...acc, ...mod.default }
   }, {})

2. Delete the old monolithic files after testing:
   - locales/en.json
   - locales/zh-TW.json

3. For build optimization, consider lazy-loading by route.
""")


if __name__ == '__main__':
    main()
