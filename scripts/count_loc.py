# -*- coding: utf-8 -*-
"""
统计项目源码行数。

排除：node_modules / target / dist / .git / .kiro / .codex / .agents / .vscode / gen / __pycache__
按文件类型分组，并区分项目自有源码 与 配置 / 文档。
"""

from __future__ import annotations
import os
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent

SKIP_DIRS = {
    "node_modules", "target", "dist", ".git", ".kiro", ".codex",
    ".agents", ".vscode", "gen", "__pycache__", "vendor",
    "mediapipe",  # public/mediapipe/wasm/* 是 MediaPipe 官方 wasm 产物，不是项目源码
}

# 把扩展名分成两类
SOURCE_EXT = {".ts", ".tsx", ".js", ".jsx", ".rs", ".css", ".html", ".py"}
META_EXT = {".json", ".toml", ".md", ".lock", ".yaml", ".yml", ".nsh"}

ALL_EXT = SOURCE_EXT | META_EXT


def is_skipped(path: Path) -> bool:
    parts = set(path.parts)
    return bool(parts & SKIP_DIRS)


def count_lines(path: Path) -> tuple[int, int]:
    """返回 (总行数, 非空非纯空白行数)"""
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
    except Exception:
        return 0, 0
    total = len(lines)
    non_blank = sum(1 for ln in lines if ln.strip())
    return total, non_blank


def main():
    by_ext = defaultdict(lambda: [0, 0, 0])  # [files, total_lines, non_blank]
    files_detail = []

    for dirpath, dirnames, filenames in os.walk(ROOT):
        # 原地剪枝
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            p = Path(dirpath) / name
            if is_skipped(p.relative_to(ROOT)):
                continue
            ext = p.suffix.lower()
            if ext not in ALL_EXT:
                continue
            # 跳过 lock 文件，行数虚高且不是源码
            if name in {"package-lock.json", "Cargo.lock"}:
                continue
            total, non_blank = count_lines(p)
            if total == 0:
                continue
            by_ext[ext][0] += 1
            by_ext[ext][1] += total
            by_ext[ext][2] += non_blank
            files_detail.append((str(p.relative_to(ROOT)), ext, total, non_blank))

    print(f"项目根目录: {ROOT}")
    print(f"扫描完成，共统计 {sum(v[0] for v in by_ext.values())} 个文件\n")

    # ── 按扩展名汇总 ──
    rows = sorted(by_ext.items(), key=lambda kv: -kv[1][1])
    print(f"{'扩展名':<10}{'文件数':>8}{'总行数':>12}{'有效行数':>12}")
    print("-" * 44)
    src_total = src_nonblank = src_files = 0
    meta_total = meta_nonblank = meta_files = 0
    for ext, (f, t, n) in rows:
        print(f"{ext:<10}{f:>8}{t:>12,}{n:>12,}")
        if ext in SOURCE_EXT:
            src_files += f; src_total += t; src_nonblank += n
        else:
            meta_files += f; meta_total += t; meta_nonblank += n

    print("-" * 44)
    print(f"{'源码合计':<10}{src_files:>8}{src_total:>12,}{src_nonblank:>12,}")
    print(f"{'配置文档':<10}{meta_files:>8}{meta_total:>12,}{meta_nonblank:>12,}")
    print(f"{'总计':<10}{src_files+meta_files:>8}"
          f"{src_total+meta_total:>12,}{src_nonblank+meta_nonblank:>12,}")

    # ── Top 15 大文件 ──
    print("\n源码 Top 15（按总行数）:")
    src_files_sorted = sorted(
        [f for f in files_detail if f[1] in SOURCE_EXT],
        key=lambda x: -x[2],
    )[:15]
    for path, ext, total, non_blank in src_files_sorted:
        print(f"  {total:>5,} 行 ({non_blank:>5,} 有效)  {path}")


if __name__ == "__main__":
    main()
