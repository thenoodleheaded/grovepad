#!/usr/bin/env python3
"""Build the iOS app icon set from geometry, not from the borderless brand mark.

The home-screen icon is masked to the squircle by the system, and since iOS 18
it comes in three appearances that the asset catalog declares side by side:

    light   opaque bright-green plate, dark-green `g`, white `p`
    dark    transparent background (iOS paints its own dark gradient behind it),
            white `g`, bright-green `p`
    tinted  transparent background, greyscale mark that iOS recolours to the
            user's chosen tint; the two letters differ in luminosity so the
            two-tone identity survives

Each is a single 1024x1024 PNG; Xcode derives every smaller size at build time.
The borderless web mark (a two-tone glyph on transparency) must not be used
here: flattened onto white it reads as a small grey/green shape floating on a
white tile, which is what looked wrong on the phone.

Run from the repository root:

    python3 scripts/build-ios-app-icon.py

Outputs:
    public/brand/app-icon-ios.png                          1024x1024 light source
    src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset/AppIcon-{light,dark,tinted}.png
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
APPICONSET = ROOT / "src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset"
SOURCE_OUT = ROOT / "public/brand/app-icon-ios.png"

SIZE = 1024          # canonical iOS marketing size
SS = 4               # supersampling factor for anti-aliased edges
CANVAS = SIZE * SS

# Colour recipes per appearance. `plate` is None for a transparent background.
# Each colour is (r, g, b); `p` takes a top and bottom colour for a vertical gradient.
APPEARANCES = {
    "light": {
        "plate": ((64, 214, 106), (20, 150, 72)),
        "g": (10, 60, 34),
        "p": ((255, 255, 255), (255, 255, 255)),
    },
    "dark": {
        "plate": None,
        "g": (240, 242, 240),
        "p": ((110, 236, 110), (34, 190, 80)),
    },
    "tinted": {
        "plate": None,
        "g": (255, 255, 255),
        "p": ((150, 150, 150), (150, 150, 150)),
    },
}

# Mark geometry, measured from the brand mark in a 1024-unit grid.
# Stroke width is 100; the `p` stem doubles as the right side of the `g` bowl.
STROKE = 100
G_BOWL_OUTER = (50, 50, 500, 500)
G_BOWL_INNER = (150, 150, 400, 400)
P_BOWL_OUTER = (400, 50, 975, 500)
P_BOWL_INNER = (500, 150, 875, 400)
P_STEM = (400, 300, 500, 960)
G_STEM = (400, 300, 500, 700)
G_BAR = (160, 600, 500, 700)
OUTER_RADIUS = 140
INNER_RADIUS = 55
END_RADIUS = 50
BAR_FILLET = 50   # half the bowl-to-bar gap, so the sweep never bites the bowl

MARK_BOX = (50, 50, 975, 960)   # bounding box of the mark in its own grid
MARK_SCALE = 0.63               # fraction of the icon width the mark occupies


def _transform():
    """Return a function mapping mark-grid coordinates to canvas pixels."""
    x0, y0, x1, y1 = MARK_BOX
    mark_w, mark_h = x1 - x0, y1 - y0
    target_w = SIZE * MARK_SCALE
    scale = target_w / mark_w
    target_h = mark_h * scale
    off_x = (SIZE - target_w) / 2 - x0 * scale
    off_y = (SIZE - target_h) / 2 - y0 * scale

    def to_px(box):
        ax, ay, bx, by = box
        return (
            (ax * scale + off_x) * SS,
            (ay * scale + off_y) * SS,
            (bx * scale + off_x) * SS,
            (by * scale + off_y) * SS,
        )

    def px(value):
        return value * scale * SS

    return to_px, px


def _fillet(draw, erase, corner, radius, quadrant, to_px, px):
    """Add a concave fillet where a horizontal edge meets the stem.

    `corner` is the (x, y) mark-grid point of the inside corner; `quadrant`
    says which side of that point the fillet square sits on.
    """
    cx, cy = corner
    r = radius
    dx, dy = quadrant
    square = (min(cx, cx + dx * r), min(cy, cy + dy * r), max(cx, cx + dx * r), max(cy, cy + dy * r))
    draw.rectangle(to_px(square), fill=255)
    circle_center = (cx + dx * r, cy + dy * r)
    circle = (circle_center[0] - r, circle_center[1] - r, circle_center[0] + r, circle_center[1] + r)
    erase.ellipse(to_px(circle), fill=255)


def _letter_masks():
    to_px, px = _transform()

    g = Image.new("L", (CANVAS, CANVAS), 0)
    g_draw = ImageDraw.Draw(g)
    g_hole = Image.new("L", (CANVAS, CANVAS), 0)
    g_hole_draw = ImageDraw.Draw(g_hole)

    g_draw.rounded_rectangle(to_px(G_BOWL_OUTER), radius=px(OUTER_RADIUS), fill=255)
    # The bowl's bottom-right corner joins the stem, so it is square, not rounded.
    g_draw.rectangle(to_px((G_BOWL_OUTER[2] - OUTER_RADIUS, G_BOWL_OUTER[3] - OUTER_RADIUS, G_BOWL_OUTER[2], G_BOWL_OUTER[3])), fill=255)
    g_hole_draw.rounded_rectangle(to_px(G_BOWL_INNER), radius=px(INNER_RADIUS), fill=255)
    g_draw.rectangle(to_px(G_STEM), fill=255)
    g_draw.rounded_rectangle(to_px(G_BAR), radius=px(END_RADIUS), fill=255)
    # Square off the bar where it meets the stem so the end radius only shows on the left.
    g_draw.rectangle(to_px((G_BAR[0] + END_RADIUS, G_BAR[1], G_BAR[2], G_BAR[3])), fill=255)
    # Concave sweep where the bar's top edge turns up into the stem, like the
    # curl of a handwritten g.
    _fillet(g_draw, g_hole_draw, (G_BAR[2] - STROKE, G_BAR[1]), BAR_FILLET, (-1, -1), to_px, px)
    g = Image.composite(Image.new("L", g.size, 0), g, g_hole)

    p = Image.new("L", (CANVAS, CANVAS), 0)
    p_draw = ImageDraw.Draw(p)
    p_hole = Image.new("L", (CANVAS, CANVAS), 0)
    p_hole_draw = ImageDraw.Draw(p_hole)

    p_draw.rounded_rectangle(to_px(P_BOWL_OUTER), radius=px(OUTER_RADIUS), fill=255)
    # The bowl's bottom-left corner joins the stem, so it is square, not rounded.
    p_draw.rectangle(to_px((P_BOWL_OUTER[0], P_BOWL_OUTER[3] - OUTER_RADIUS, P_BOWL_OUTER[0] + OUTER_RADIUS, P_BOWL_OUTER[3])), fill=255)
    p_hole_draw.rounded_rectangle(to_px(P_BOWL_INNER), radius=px(INNER_RADIUS), fill=255)
    p_draw.rounded_rectangle(to_px(P_STEM), radius=px(END_RADIUS), fill=255)
    p_draw.rectangle(to_px((P_STEM[0], P_STEM[1], P_STEM[2], P_STEM[3] - END_RADIUS)), fill=255)
    p = Image.composite(Image.new("L", p.size, 0), p, p_hole)

    return g, p


def _plate(top, bottom) -> np.ndarray:
    top = np.array(top, dtype=np.float32)
    bottom = np.array(bottom, dtype=np.float32)
    ys, xs = np.mgrid[0:CANVAS, 0:CANVAS].astype(np.float32)
    t = (xs * 0.35 + ys * 0.65) / (CANVAS * 1.0)   # diagonal, mostly vertical
    t = np.clip(t, 0, 1)[..., None]
    rgb = top * (1 - t) + bottom * t
    # Soft light bloom in the upper-left so the plate does not look printed flat.
    cx, cy = CANVAS * 0.28, CANVAS * 0.18
    d = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2) / (CANVAS * 0.9)
    bloom = np.clip(1 - d, 0, 1) ** 2 * 22
    rgb = np.clip(rgb + bloom[..., None], 0, 255)
    return rgb


def render(appearance: str = "light", masks=None) -> Image.Image:
    """Render one appearance at 1024x1024. Opaque RGB when it has a plate, RGBA otherwise."""
    recipe = APPEARANCES[appearance]
    g_mask, p_mask = masks or _letter_masks()
    g = np.asarray(g_mask, dtype=np.float32)[..., None] / 255
    p = np.asarray(p_mask, dtype=np.float32)[..., None] / 255
    t = (np.arange(CANVAS, dtype=np.float32) / CANVAS)[:, None, None]
    p_top, p_bottom = (np.array(c, dtype=np.float32) for c in recipe["p"])
    p_color = p_top * (1 - t) + p_bottom * t
    g_color = np.array(recipe["g"], dtype=np.float32)

    if recipe["plate"] is not None:
        rgb = _plate(*recipe["plate"])
        rgb = rgb * (1 - g) + g_color * g
        rgb = rgb * (1 - p) + p_color * p
        big = Image.fromarray(rgb.astype(np.uint8))
    else:
        # Premultiplied-free compositing onto transparency: the `p` sits on top of the `g`.
        alpha = p + g * (1 - p)
        safe = np.where(alpha > 0, alpha, 1)
        rgb = (p_color * p + g_color * g * (1 - p)) / safe
        rgba = np.concatenate([rgb, alpha * 255], axis=-1)
        big = Image.fromarray(rgba.astype(np.uint8))
    return big.resize((SIZE, SIZE), Image.LANCZOS)


def write_icons() -> list[Path]:
    written: list[Path] = []
    masks = _letter_masks()
    SOURCE_OUT.parent.mkdir(parents=True, exist_ok=True)
    for appearance in APPEARANCES:
        image = render(appearance, masks)
        out = APPICONSET / f"AppIcon-{appearance}.png"
        image.save(out, optimize=True)
        written.append(out)
        if appearance == "light":
            image.save(SOURCE_OUT, optimize=True)
            written.append(SOURCE_OUT)
    return written


if __name__ == "__main__":
    for path in write_icons():
        print(path.relative_to(ROOT))
