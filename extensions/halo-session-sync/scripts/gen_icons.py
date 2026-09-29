#!/usr/bin/env python3
"""Write minimal solid-color PNG icons for HALO Session Sync."""
import struct, zlib, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1] / "icons"
ROOT.mkdir(parents=True, exist_ok=True)

def png(size: int, rgb=(0x16, 0xA3, 0x4A)) -> bytes:
    r, g, b = rgb
    raw = b""
    for _y in range(size):
        raw += b"\x00"
        for _x in range(size):
            # simple mark: darker edge, brighter center square
            edge = _x < size * 0.12 or _x >= size * 0.88 or _y < size * 0.12 or _y >= size * 0.88
            if edge:
                raw += bytes((0x0B, 0x0F, 0x14, 0xFF))
            else:
                raw += bytes((r, g, b, 0xFF))
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")

for s in (16, 48, 128):
    path = ROOT / f"icon{s}.png"
    path.write_bytes(png(s))
    print("wrote", path, path.stat().st_size)
