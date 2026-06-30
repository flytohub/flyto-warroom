#!/usr/bin/env python3
"""
add_upstream_keys.py — adds the Phase A upstream-data-strategy
i18n keys to en / zh-TW / zh-CN. One-shot script; safe to re-run
(idempotent — adds keys only if missing).

Keys cover:
  SLAMonitor      : error budget panel + MTTR trend strip
  ScoreTrends     : peer benchmark + forecast chips
  ExecReport      : audience preset themes (board/soc/external/compliance)
  Mitigations     : auto-evidence dialog (close/empty/title)
  BrandProtection : takedown letter PDF + reset + placeholder
  AttackPaths     : v2 graph chain probability labels
  ActivityFeed    : burst banner labels

Run from repo root:  python scripts/add_upstream_keys.py
Then rebuild dist:    python scripts/build-dist.py
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCALES = ROOT / "locales" / "code"

# (key, en, zh-TW, zh-CN) — translations kept short + operator-tone.
KEYS = [
    # ── SLAMonitor: error budget ──────────────────────────────
    ("code.external.errorBudget",
     "Error budget",
     "錯誤預算",
     "错误预算"),
    ("code.external.errorBudgetHint",
     "SLA breach tolerance per severity per quarter — declare a policy under Settings to enable.",
     "每季每嚴重度可容忍的 SLA 違反次數，在設定中宣告政策後啟用。",
     "每季度每严重度可容忍的 SLA 违反次数,在设置中声明政策后启用。"),
    ("code.external.budgetInactive",
     "policy paused",
     "政策已暫停",
     "政策已暂停"),
    ("code.external.budgetExhausted",
     "over budget",
     "已超出預算",
     "已超出预算"),
    ("code.external.budgetRemaining",
     "left",
     "剩餘",
     "剩余"),
    ("code.external.mttrTrend",
     "MTTR trend",
     "MTTR 趨勢",
     "MTTR 趋势"),
    ("code.external.mttrTrendHint",
     "P50 last 4 weeks vs prior 4 — negative = improving",
     "近 4 週 P50 對照前 4 週，負值代表改善中",
     "近 4 周 P50 对照前 4 周,负值代表改善中"),
    # ── ScoreTrends: peer + forecast ─────────────────────────
    ("code.external.peerBenchmarkHint",
     "Sector benchmark from public corpus. Updated daily.",
     "同業基準來自公開語料庫，每日更新。",
     "同业基准来自公开语料库,每日更新。"),
    ("code.external.peerSectorPrefix",
     "Sector",
     "產業",
     "行业"),
    ("code.external.forecastHint",
     "30-day projection from linear trend + 7-day seasonal. Bands widen with horizon; near-term is more reliable.",
     "30 天預測（線性趨勢 + 7 日季節分解）。預測區間隨時間變寬,近期較可靠。",
     "30 天预测(线性趋势 + 7 日季节分解)。预测区间随时间变宽,近期较可靠。"),
    ("code.external.forecast30d",
     "Forecast 30d",
     "30 天預測",
     "30 天预测"),
    # ── ExecReport: audience presets ─────────────────────────
    ("code.external.reportAudience",
     "Audience",
     "對象",
     "对象"),
    ("code.external.preset_board",
     "Board",
     "董事會",
     "董事会"),
    ("code.external.preset_soc",
     "SOC",
     "SOC",
     "SOC"),
    ("code.external.preset_external",
     "External",
     "對外",
     "对外"),
    ("code.external.preset_compliance",
     "Compliance",
     "合規",
     "合规"),
    ("code.external.preset_custom",
     "Custom",
     "自訂",
     "自定义"),
    ("code.external.preset_board_hint",
     "High-level posture + trends only. No raw findings list, no SLA detail.",
     "僅高階姿態與趨勢，不含原始發現清單與 SLA 細節。",
     "仅高阶姿态与趋势,不含原始发现清单与 SLA 细节。"),
    ("code.external.preset_soc_hint",
     "Everything, no redaction — internal operations briefing.",
     "完整資料、無遮蔽——內部營運簡報。",
     "完整数据、无遮蔽——内部运营简报。"),
    ("code.external.preset_external_hint",
     "Summary view + redacted hostnames for sharing with vendors / partners / press.",
     "摘要視圖 + 遮蔽主機名稱,適用於供應商、合作夥伴、媒體分享。",
     "摘要视图 + 遮蔽主机名称,适用于供应商、合作伙伴、媒体分享。"),
    ("code.external.preset_compliance_hint",
     "Findings + SLA + controls — the audit trail an external assessor needs.",
     "發現 + SLA + 控制項——外部稽核所需的完整軌跡。",
     "发现 + SLA + 控制项——外部稽核所需的完整轨迹。"),
    # ── Mitigations: evidence dialog ─────────────────────────
    ("code.mit.evidenceDialogTitle",
     "Evidence history",
     "證據歷史",
     "证据历史"),
    ("code.mit.evidenceEmpty",
     "No automated checks recorded yet. The hourly evidence worker probes verification_evidence URLs — add a probe-able URL on this control to start the ledger.",
     "尚無自動檢查記錄。每小時的證據 worker 會探測 verification_evidence URL — 為此控制項加上可探測的 URL 即可開始記錄。",
     "尚无自动检查记录。每小时的证据 worker 会探测 verification_evidence URL — 为此控制项加上可探测的 URL 即可开始记录。"),
    ("code.mit.close",
     "Close",
     "關閉",
     "关闭"),
    # ── BrandProtection: takedown letter ─────────────────────
    ("code.exposure.brand.resetLetter",
     "Reset to template",
     "還原為範本",
     "还原为模板"),
    ("code.exposure.brand.pdfWorking",
     "Generating...",
     "產生中...",
     "生成中..."),
    ("code.exposure.brand.downloadPDF",
     "Download PDF",
     "下載 PDF",
     "下载 PDF"),
    ("code.exposure.brand.letterPlaceholder",
     "Letter will appear here once the template loads…",
     "範本載入完成後信件內容會顯示於此…",
     "模板加载完成后信件内容会显示于此…"),
    # ── AttackPaths: v2 graph ────────────────────────────────
    ("code.paths.methodGraph",
     "Bounded BFS over the asset+finding graph. Probability is the product of per-edge weights.",
     "在資產+發現圖上的有界 BFS，機率為每條邊權重的乘積。",
     "在资产+发现图上的有界 BFS,概率为每条边权重的乘积。"),
    ("code.paths.methodHeuristic",
     "Pattern-matched against handcrafted chain shapes (v1). The priority number is a loudness score, not a probability.",
     "比對手寫鏈條形狀（v1）。優先度為強度分數,非機率。",
     "比对手写链条形状(v1)。优先度为强度分数,非概率。"),
    ("code.paths.chainProbLabel",
     "Chain probability",
     "鏈條機率",
     "链条概率"),
    ("code.paths.stepsToggle",
     "Per-edge breakdown",
     "逐邊拆解",
     "逐边拆解"),
    # ── ActivityFeed: burst ──────────────────────────────────
    ("code.exposure.activity.burstPrefix",
     "Burst",
     "突發",
     "突发"),
    ("code.exposure.activity.burstEvents",
     "events",
     "件事件",
     "件事件"),
    ("code.exposure.activity.burstIn",
     "in",
     "於",
     "于"),
    ("code.exposure.activity.burstMinutes",
     "m",
     "分鐘",
     "分钟"),
    ("code.exposure.activity.burstHint",
     "possible scan campaign or coordinated attack. Inspect filtered category below.",
     "可能是掃描行動或協同攻擊，請檢視下方過濾後的類別。",
     "可能是扫描行动或协同攻击,请查看下方过滤后的类别。"),
]

LOCALE_INDEX = {"en": 1, "zh-TW": 2, "zh-CN": 3}


def update_locale(locale: str) -> tuple[int, int]:
    """Returns (added, already_present)."""
    path = LOCALES / locale / "code.json"
    if not path.exists():
        print(f"  ! {locale}: code.json missing, skipping", file=sys.stderr)
        return 0, 0
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    translations = data.setdefault("translations", {})
    col = LOCALE_INDEX[locale]
    added = present = 0
    for entry in KEYS:
        key = entry[0]
        value = entry[col]
        if key in translations:
            present += 1
            continue
        translations[key] = value
        added += 1
    # Sort keys so diffs stay sane.
    data["translations"] = dict(sorted(translations.items()))
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=False)
        f.write("\n")
    return added, present


def main() -> int:
    print(f"adding {len(KEYS)} upstream-data keys to 3 locales")
    for locale in ("en", "zh-TW", "zh-CN"):
        added, present = update_locale(locale)
        print(f"  {locale}: +{added} new, {present} already present")
    print("done. next: python scripts/build-dist.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
