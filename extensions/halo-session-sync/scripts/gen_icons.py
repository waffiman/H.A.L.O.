#!/usr/bin/env python3
"""Rasterize HALO logo.svg → icon16/48/128.png for the Chrome extension."""
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
SVG = ROOT / "icons" / "logo.svg"
OUT = ROOT / "icons"


def render(size: int) -> None:
    data = SVG.read_bytes()
    doc = pymupdf.open(stream=data, filetype="svg")
    page = doc[0]
    pix = page.get_pixmap(
        matrix=pymupdf.Matrix(size / page.rect.width, size / page.rect.height),
        alpha=True,
    )
    path = OUT / f"icon{size}.png"
    pix.save(path.as_posix())
    doc.close()
    print("wrote", path, path.stat().st_size)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    if not SVG.is_file():
        raise SystemExit(f"missing {SVG}")
    for s in (16, 48, 128):
        render(s)


if __name__ == "__main__":
    main()
