#!/usr/bin/env python3
"""
sync-to-projects.py - Sync dist/ to consuming projects' bundled i18n files

When keys are added or DELETED from flyto-i18n, this script pushes those
changes to each project's local bundled/copied i18n files.

Projects handled:
  - flyto-cloud:  src/ui/web/frontend/src/i18n/bundled/{locale}.json  (scope: cloud)
  - flyto-code:   public/i18n/{scope}/{locale}.json                   (all scopes)
  - flyto-app:    assets/i18n/{locale}.json                           (via build-app.py)

Usage:
    python scripts/sync-to-projects.py [--dry-run] [--project NAME]

Options:
    --dry-run       Show changes without writing files
    --project NAME  Only sync to a specific project (cloud, code, app)
"""

import argparse
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
DIST_DIR = PROJECT_ROOT / 'dist'
PARENT_DIR = PROJECT_ROOT.parent

# Project sync configurations
# Each entry: (project_dir, target_subpath, scope, locales_filter)
# scope=None means copy all scopes; locales_filter=None means all locales
SYNC_TARGETS = {
    'cloud': {
        'repo': 'flyto-cloud',
        'targets': [
            {
                'scope': 'cloud',
                'dest': 'src/ui/web/frontend/src/i18n/bundled',
                'locales': ['en', 'zh-TW', 'zh-CN'],
                'mode': 'single-scope',  # copy dist/cloud/{locale}.json -> dest/{locale}.json
            },
        ],
    },
    'code': {
        'repo': 'flyto-code',
        'targets': [
            {
                'scope': scope,
                'dest': f'public/i18n/{scope}',
                'locales': None,  # all locales
                'mode': 'single-scope',
            }
            for scope in ['cloud', 'code', 'console', 'data', 'app', 'cortex']
        ] + [
            {
                'scope': scope,
                'dest': f'public/i18n/{scope}',
                'locales': None,
                'mode': 'single-scope-with-manifest',  # also copy manifest.json
            }
            for scope in []  # manifests are handled below
        ],
    },
    'app': {
        'repo': 'flyto-app',
        'targets': [
            {
                'scope': 'app',
                'dest': 'assets/i18n',
                'locales': ['en', 'zh-TW'],
                'mode': 'build-app',  # use build-app.py instead of direct copy
            },
        ],
    },
}

STAT_KEYS = ('added', 'updated', 'deleted', 'unchanged')


def new_stats() -> dict:
    """Create a sync stats accumulator."""
    return {key: 0 for key in STAT_KEYS}


def merge_stats(total: dict, stats: dict) -> None:
    """Add per-target stats into a project total."""
    for key in STAT_KEYS:
        total[key] += stats[key]


def get_dist_locales(scope: str) -> list:
    """Get available locales for a scope from dist/."""
    scope_dir = DIST_DIR / scope
    if not scope_dir.exists():
        return []
    return sorted([
        f.stem for f in scope_dir.glob('*.json')
        if f.stem != 'manifest'
    ])


def get_target_locales(scope: str, locales_filter: list = None) -> list:
    """Resolve the locale list to sync for a scope."""
    available_locales = get_dist_locales(scope)
    if locales_filter:
        return [locale for locale in locales_filter if locale in available_locales]
    return available_locales


def sync_locale_file(src_file: Path, dst_file: Path, dry_run: bool) -> dict:
    """Sync one locale file and return its stats delta."""
    stats = new_stats()
    src_data = src_file.read_text(encoding='utf-8')

    if dst_file.exists():
        dst_data = dst_file.read_text(encoding='utf-8')
        if src_data == dst_data:
            stats['unchanged'] += 1
            return stats
        action = 'update'
        stats['updated'] += 1
    else:
        action = 'add'
        stats['added'] += 1

    if dry_run:
        print(f"    Would {action}: {dst_file.name}")
    else:
        dst_file.parent.mkdir(parents=True, exist_ok=True)
        dst_file.write_text(src_data, encoding='utf-8')
        print(f"    {action.capitalize()}d: {dst_file.name}")

    return stats


def is_deletable_locale_file(filename: str, expected_files: set) -> bool:
    """Return true when a target JSON file is a stale locale file."""
    stem = filename.replace('.json', '')
    if filename in expected_files:
        return False
    if stem in {'manifest', 'landing'}:
        return False
    return filename.endswith('.json') and len(stem) >= 2


def delete_stale_locale_files(dest_dir: Path, expected_files: set, dry_run: bool) -> dict:
    """Delete target locale JSON files that no longer exist in dist."""
    stats = new_stats()
    if not dest_dir.exists():
        return stats

    existing_files = {file.name for file in dest_dir.glob('*.json')}
    deletable = {
        filename
        for filename in existing_files
        if is_deletable_locale_file(filename, expected_files)
    }

    for filename in sorted(deletable):
        stats['deleted'] += 1
        if dry_run:
            print(f"    Would delete: {filename} (removed from i18n source)")
        else:
            (dest_dir / filename).unlink()
            print(f"    Deleted: {filename} (removed from i18n source)")

    return stats


def sync_manifest(source_dir: Path, dest_dir: Path, dry_run: bool) -> bool:
    """Sync manifest.json if it exists. Returns true when it changed."""
    src_manifest = source_dir / 'manifest.json'
    dst_manifest = dest_dir / 'manifest.json'
    if not src_manifest.exists():
        return False

    src_data = src_manifest.read_text(encoding='utf-8')
    needs_update = not dst_manifest.exists() or dst_manifest.read_text(encoding='utf-8') != src_data
    if not needs_update:
        return False

    if dry_run:
        print(f"    Would update manifest: {dest_dir.name}/manifest.json")
    else:
        dest_dir.mkdir(parents=True, exist_ok=True)
        dst_manifest.write_text(src_data, encoding='utf-8')

    return True


def sync_single_scope(
    scope: str,
    dest_dir: Path,
    locales_filter: list = None,
    dry_run: bool = False,
    copy_manifest: bool = False,
) -> dict:
    """Sync a single scope's dist files to a destination directory.

    Returns stats: {added, updated, deleted, unchanged}
    """
    source_dir = DIST_DIR / scope
    stats = new_stats()

    if not source_dir.exists():
        print(f"    Warning: dist/{scope}/ does not exist, skipping")
        return stats

    target_locales = get_target_locales(scope, locales_filter)

    # --- Sync locale files ---
    for locale in target_locales:
        src_file = source_dir / f'{locale}.json'
        dst_file = dest_dir / f'{locale}.json'

        if not src_file.exists():
            continue

        merge_stats(stats, sync_locale_file(src_file, dst_file, dry_run))

    # --- Delete locale files that no longer exist in dist ---
    expected_files = {f'{locale}.json' for locale in target_locales}
    if copy_manifest:
        expected_files.add('manifest.json')
    merge_stats(stats, delete_stale_locale_files(dest_dir, expected_files, dry_run))

    # --- Copy manifest if requested ---
    if copy_manifest:
        sync_manifest(source_dir, dest_dir, dry_run)

    return stats


def run_build_app(dry_run: bool) -> None:
    """Run build-app.py for flyto-app targets."""
    if dry_run:
        print(f"    Would run build-app.py")
        return

    result = subprocess.run(
        [sys.executable, str(PROJECT_ROOT / 'scripts' / 'build-app.py')],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode == 0:
        print(f"    build-app.py completed successfully")
    else:
        print(f"    build-app.py failed: {result.stderr}")


def sync_code_manifests(repo_path: Path, dry_run: bool) -> None:
    """Sync dist manifest files to flyto-code public i18n directories."""
    for scope_dir in DIST_DIR.iterdir():
        if not scope_dir.is_dir():
            continue

        src_manifest = scope_dir / 'manifest.json'
        dest_dir = repo_path / 'public' / 'i18n' / scope_dir.name
        if not src_manifest.exists() or not dest_dir.exists():
            continue

        changed = sync_manifest(scope_dir, dest_dir, dry_run)
        if changed and dry_run:
            continue
        if changed:
            print(f"    Updated manifest: {scope_dir.name}/manifest.json")


def print_summary(total: dict) -> None:
    """Print a project sync summary."""
    changes = total['added'] + total['updated'] + total['deleted']
    if not changes:
        print(f"  Already in sync ({total['unchanged']} files)")
        return

    parts = []
    if total['added']:
        parts.append(f"+{total['added']} added")
    if total['updated']:
        parts.append(f"~{total['updated']} updated")
    if total['deleted']:
        parts.append(f"-{total['deleted']} deleted")
    print(f"  Summary: {', '.join(parts)} ({total['unchanged']} unchanged)")


def sync_project(name: str, config: dict, dry_run: bool = False):
    """Sync all targets for a project."""
    repo_path = PARENT_DIR / config['repo']

    if not repo_path.exists():
        print(f"  Skip: {config['repo']}/ not found")
        return

    print(f"\n[{config['repo']}]")

    total = new_stats()

    for target in config['targets']:
        scope = target['scope']
        dest = repo_path / target['dest']
        locales = target.get('locales')
        mode = target.get('mode', 'single-scope')

        if mode == 'build-app':
            # For flyto-app, delegate to build-app.py
            print(f"  [{scope}] -> {target['dest']}/ (via build-app.py)")
            run_build_app(dry_run)
            continue

        print(f"  [{scope}] -> {target['dest']}/")
        copy_manifest = mode == 'single-scope-with-manifest'
        stats = sync_single_scope(scope, dest, locales, dry_run, copy_manifest)
        merge_stats(total, stats)

    # --- Also sync manifests for flyto-code ---
    if name == 'code':
        sync_code_manifests(repo_path, dry_run)

    # Summary
    print_summary(total)


def main():
    parser = argparse.ArgumentParser(
        description='Sync dist/ translations to consuming projects'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview changes without writing files'
    )
    parser.add_argument(
        '--project',
        choices=['cloud', 'code', 'app'],
        help='Only sync a specific project'
    )

    args = parser.parse_args()

    print("Syncing flyto-i18n/dist/ -> consuming projects")
    print(f"Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    print("=" * 60)

    if not DIST_DIR.exists():
        print("Error: dist/ not found. Run build-dist.py first.")
        sys.exit(1)

    targets = SYNC_TARGETS
    if args.project:
        targets = {args.project: SYNC_TARGETS[args.project]}

    for name, config in targets.items():
        sync_project(name, config, args.dry_run)

    print("\n" + "=" * 60)
    if args.dry_run:
        print("Run without --dry-run to apply changes")
    else:
        print("Sync complete!")
        print("\nNext steps:")
        print("  1. Review changes in each project")
        print("  2. Commit and push each project")
        print("  3. Run each project's check-i18n.py to verify")


if __name__ == '__main__':
    main()
