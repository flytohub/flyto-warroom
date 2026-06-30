#!/usr/bin/env python3
"""真實翻譯覆蓋率檢查 — 以 en 為基準,計算每個語言的缺鍵+空值。
用法: python3 scripts/check_coverage.py [--min 100] [--lang zh-CN]
退出碼: 任一語言低於 --min(預設不擋,只報告;給 --min N 則低於 N 時 exit 1)。
這支腳本是 FLYA-152 的驗收尺:翻譯前後各跑一次,覆蓋率必須真的上升。
"""
import json, glob, os, sys, argparse
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def collect(lang):
    keys = {}
    for f in glob.glob(os.path.join(ROOT, 'locales', '**', '*.json'), recursive=True):
        if lang not in f.split(os.sep):
            continue
        try:
            d = json.load(open(f))
        except Exception:
            continue
        tr = d.get('translations', {}) if isinstance(d, dict) else {}
        if not isinstance(tr, dict):
            continue
        ns = d.get('category', f)
        for k, v in tr.items():
            keys[f"{ns}::{k}"] = v
    return keys

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--min', type=float, default=None, help='低於此覆蓋率(%)則 exit 1')
    ap.add_argument('--lang', default=None, help='只檢查單一語言')
    args = ap.parse_args()

    man = json.load(open(os.path.join(ROOT, 'manifest.json')))
    langs = list(man.get('locales', {}).keys())
    if args.lang:
        langs = [args.lang]

    en = collect('en')
    en_keys = set(en)
    print(f"en(基準) {len(en_keys)} keys\n")
    print(f"{'lang':8} {'missing':>8} {'empty':>7} {'coverage':>9}")
    worst = 100.0
    for lang in langs:
        kv = en if lang == 'en' else collect(lang)
        missing = len(en_keys - set(kv))
        empty = sum(1 for k in en_keys if k in kv and isinstance(kv[k], str) and not kv[k].strip())
        good = len(en_keys) - missing - empty
        pct = round(good / len(en_keys) * 100, 1) if en_keys else 0.0
        worst = min(worst, pct)
        flag = ' <' if (args.min and pct < args.min) else ''
        print(f"{lang:8} {missing:>8} {empty:>7} {pct:>8}%{flag}")

    if args.min and worst < args.min:
        print(f"\nFAIL: 最低覆蓋率 {worst}% < 要求 {args.min}%")
        sys.exit(1)
    print(f"\nOK: 最低覆蓋率 {worst}%")

if __name__ == '__main__':
    main()
