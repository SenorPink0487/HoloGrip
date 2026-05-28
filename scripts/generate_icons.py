"""
一次性脚本:把项目根目录的 logo.png 处理成圆角图标,
仅生成 Tauri 桌面端所需的全部尺寸。

生成产物:
  src-tauri/icons/
    32x32.png
    128x128.png
    128x128@2x.png  (256x256)
    icon.png        (1024x1024,Tauri 默认主图)
    icon.ico        (Windows 多尺寸 ICO)
    icon.icns       (macOS,若环境不支持则跳过)
    StoreLogo.png   (50x50)
    Square30x30Logo.png ~ Square310x310Logo.png  (Windows Store)

注:之前还会写一份 public/app-logo.png 供 TitleBar 使用,
但 TitleBar 现在用文字 + 圆点呈现,源码里没有引用该图,
打包到 dist 反而成了死资源,因此该步骤已删除。

圆角半径默认取边长 * 18%,接近 macOS Big Sur 与 Windows 11 之间的折中。
若想换"超圆"风格改 ROUND_RATIO=0.22;想要"方一点"改 0.10。
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

# ─── 配置 ──────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "logo.png"
ICONS_DIR = ROOT / "src-tauri" / "icons"

ROUND_RATIO = 0.18                 # 圆角半径 = 边长 * ROUND_RATIO
SUPERSAMPLE = 4                    # 抗锯齿倍率(画大再缩,边缘平滑)
MASTER_SIZE = 1024                 # 主图尺寸,后续所有规格从这里下采样

# Tauri 默认 windows 平台需要的关键文件名
PLAIN_SIZES = {
    "32x32.png": 32,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "icon.png": 1024,
}

# Windows Store 方形 logo(打包 .msix 时用,不打包也无害)
SQUARE_LOGOS = {
    "StoreLogo.png": 50,
    "Square30x30Logo.png": 30,
    "Square44x44Logo.png": 44,
    "Square71x71Logo.png": 71,
    "Square89x89Logo.png": 89,
    "Square107x107Logo.png": 107,
    "Square142x142Logo.png": 142,
    "Square150x150Logo.png": 150,
    "Square284x284Logo.png": 284,
    "Square310x310Logo.png": 310,
}

# Windows ICO 内嵌的尺寸
ICO_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def make_rounded(src_img: Image.Image, size: int, radius_ratio: float = ROUND_RATIO) -> Image.Image:
    """把 src_img 居中正方裁切 + 圆角 + 缩放到 size×size,返回带 alpha 的 RGBA 图。"""
    # 1. 中心正方裁切,防止原图非正方时变形
    w, h = src_img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    cropped = src_img.crop((left, top, left + side, top + side)).convert("RGBA")

    # 2. 用超采样画蒙版,缩回去时圆角更平滑
    big = size * SUPERSAMPLE
    base = cropped.resize((big, big), Image.LANCZOS)

    mask = Image.new("L", (big, big), 0)
    draw = ImageDraw.Draw(mask)
    radius = int(big * radius_ratio)
    draw.rounded_rectangle((0, 0, big, big), radius=radius, fill=255)

    out_big = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    out_big.paste(base, (0, 0), mask)

    # 3. 缩回目标尺寸
    return out_big.resize((size, size), Image.LANCZOS)


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"找不到源图: {SRC}")

    ICONS_DIR.mkdir(parents=True, exist_ok=True)

    src = Image.open(SRC)
    print(f"读取源图 {SRC.name} {src.size} {src.mode}")

    # 主图(后续所有平面 PNG 从这张缩,保证一致性)
    master = make_rounded(src, MASTER_SIZE)
    print(f"  master {MASTER_SIZE}x{MASTER_SIZE} 已生成")

    # ─── Tauri 关键 PNG ───
    for name, size in PLAIN_SIZES.items():
        img = master if size == MASTER_SIZE else master.resize((size, size), Image.LANCZOS)
        path = ICONS_DIR / name
        img.save(path, "PNG", optimize=True)
        print(f"  {path.relative_to(ROOT)}")

    # ─── Windows Store 方形 logo ───
    for name, size in SQUARE_LOGOS.items():
        img = master.resize((size, size), Image.LANCZOS)
        path = ICONS_DIR / name
        img.save(path, "PNG", optimize=True)
        print(f"  {path.relative_to(ROOT)}")

    # ─── Windows .ico(多尺寸) ───
    ico_path = ICONS_DIR / "icon.ico"
    master.save(ico_path, "ICO", sizes=ICO_SIZES)
    print(f"  {ico_path.relative_to(ROOT)}  尺寸={ICO_SIZES}")

    # ─── macOS .icns(Pillow 写 ICNS 需要 1024×1024 RGBA) ───
    icns_path = ICONS_DIR / "icon.icns"
    try:
        master.save(icns_path, format="ICNS")
        print(f"  {icns_path.relative_to(ROOT)}")
    except Exception as e:
        print(f"  跳过 icon.icns (Pillow 写 ICNS 失败: {e})")

    print("全部完成。")


if __name__ == "__main__":
    main()
