"""Regenerate count_brandlogo.png from count_whitelogo.png using system brand color #002c49."""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "images" / "count_whitelogo.png"
DST = ROOT / "public" / "images" / "count_brandlogo.png"
BRAND_RGB = (0, 44, 73)


def main() -> None:
    img = Image.open(SRC).convert("RGBA")
    pixels = img.load()
    width, height = img.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a > 20:
                pixels[x, y] = (*BRAND_RGB, a)
    img.save(DST)
    print(f"Wrote {DST} ({width}x{height})")


if __name__ == "__main__":
    main()
