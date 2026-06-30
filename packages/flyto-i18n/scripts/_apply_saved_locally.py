#!/usr/bin/env python3
import json, sys, io
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = Path(__file__).resolve().parent.parent / 'locales' / 'code'

ADDS = {
    'code.reports.savedLocallyOnly': (
        'Saved locally (server unavailable)',
        '已存到本機(伺服器無法連線)',
        '已保存到本机(服务器无法连接)',
        'ローカルに保存(サーバー利用不可)',
    ),
}

en_path = ROOT / 'en' / 'code.json'
en = json.loads(en_path.read_text(encoding='utf-8'))
for k, vals in ADDS.items():
    en['translations'][k] = vals[0]
en_path.write_text(json.dumps(en, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'en: +{len(ADDS)}')
for lang_idx, lang in enumerate(('zh-TW', 'zh-CN', 'ja'), start=1):
    p = ROOT / lang / 'code.json'
    doc = json.loads(p.read_text(encoding='utf-8'))
    for k, vals in ADDS.items():
        doc['translations'][k] = vals[lang_idx]
    p.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{lang}: +{len(ADDS)}')
