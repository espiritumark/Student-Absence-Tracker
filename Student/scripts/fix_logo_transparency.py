"""Remove baked checkerboard from logo PNG and write true alpha transparency."""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "logo-original.png"
OUTPUT = ROOT / "public" / "logo.png"


def is_checker(r: int, g: int, b: int) -> bool:
    spread = max(r, g, b) - min(r, g, b)
    if spread > 10:
        return False
    avg = (r + g + b) / 3
    return avg >= 247 or 215 <= avg <= 235


def idx(x: int, y: int, width: int) -> int:
    return y * width + x


def main() -> None:
    image = Image.open(SOURCE).convert("RGBA")
    pixels = image.load()
    width, height = image.size
    transparent = bytearray(width * height)

    queue: deque[tuple[int, int]] = deque()
    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        i = idx(x, y, width)
        if transparent[i]:
            continue
        r, g, b, _a = pixels[x, y]
        if not is_checker(r, g, b):
            continue
        transparent[i] = 1
        if x > 0:
            queue.append((x - 1, y))
        if x < width - 1:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y < height - 1:
            queue.append((x, y + 1))

    for _ in range(120):
        changed = False
        for y in range(height):
            for x in range(width):
                i = idx(x, y, width)
                if transparent[i]:
                    continue
                r, g, b, _a = pixels[x, y]
                if not is_checker(r, g, b):
                    continue
                touches = (
                    (x > 0 and transparent[idx(x - 1, y, width)])
                    or (x < width - 1 and transparent[idx(x + 1, y, width)])
                    or (y > 0 and transparent[idx(x, y - 1, width)])
                    or (y < height - 1 and transparent[idx(x, y + 1, width)])
                )
                if not touches:
                    continue
                transparent[i] = 1
                changed = True
        if not changed:
            break

    visited = bytearray(width * height)
    for y in range(height):
        for x in range(width):
            start = idx(x, y, width)
            if visited[start] or transparent[start]:
                continue
            r, g, b, _a = pixels[x, y]
            if not is_checker(r, g, b):
                continue

            component: list[int] = []
            stack = [start]
            visited[start] = 1
            touches_border = x == 0 or y == 0 or x == width - 1 or y == height - 1
            white_count = 0

            while stack:
                i = stack.pop()
                component.append(i)
                px = i % width
                py = i // width
                pr, _pg, _pb, _pa = pixels[px, py]
                if pr >= 247:
                    white_count += 1
                if px == 0 or py == 0 or px == width - 1 or py == height - 1:
                    touches_border = True

                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = px + dx, py + dy
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    ni = idx(nx, ny, width)
                    if visited[ni] or transparent[ni]:
                        continue
                    nr, ng, nb, _na = pixels[nx, ny]
                    if not is_checker(nr, ng, nb):
                        continue
                    visited[ni] = 1
                    stack.append(ni)

            mostly_white = white_count / len(component) > 0.85
            keep_book_white = mostly_white and len(component) > 900
            if touches_border or keep_book_white:
                continue

            for i in component:
                transparent[i] = 1

    alpha_zero = 0
    for y in range(height):
        for x in range(width):
            i = idx(x, y, width)
            if transparent[i]:
                pixels[x, y] = (0, 0, 0, 0)
                alpha_zero += 1

    image.save(OUTPUT, format="PNG", optimize=True)
    total = width * height
    print(f"Wrote {OUTPUT.name}: {alpha_zero}/{total} transparent pixels")


if __name__ == "__main__":
    main()
