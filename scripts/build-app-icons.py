#!/usr/bin/env python3
"""Build every app icon from one piece of geometry.

The `gp` mark is drawn as shapes (no bitmap source), supersampled and
downscaled so every edge is anti-aliased, then written out for each platform
in the shape that platform expects:

    iOS      three 1024px appearance variants in the Xcode catalog — light
             (opaque green plate, dark `g`, white `p`), dark (transparent,
             white `g`, green `p`; iOS 18+ paints its own dark gradient
             behind it) and tinted (transparent greyscale iOS recolours).
             Xcode derives every smaller size at build time.
    web      apple-touch-icon.png (180px light, Safari "Add to Home Screen"),
             app-icon-192/512.png (rounded tile, manifest `purpose: any`) and
             app-icon-maskable-192/512.png (full-bleed with the mark pulled
             into the 80 % safe zone, manifest `purpose: maskable`).
    tauri    a manifest plus layers under src-tauri/icon-source/ that
             `npx tauri icon src-tauri/icon-source/manifest.json` turns into
             the Windows .ico, Linux PNGs, Windows Store logos and the Android
             adaptive icon (background plate, foreground mark, monochrome mark).
    macOS    icon.icns built here with `iconutil` from the Apple-style inset
             rounded tile with a soft shadow, because `tauri icon` would
             stretch the square source edge to edge.

Run from the repository root:

    python3 scripts/build-app-icons.py

The browser-tab favicons are deliberately not produced here: at 16 px a
plated icon is a green blob, so the tab keeps the borderless ink-only mark.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
APPICONSET = ROOT / "src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset"
TAURI_ICONS = ROOT / "src-tauri/icons"
TAURI_SOURCE = ROOT / "src-tauri/icon-source"
PUBLIC = ROOT / "public"
SOURCE_OUT = PUBLIC / "brand/app-icon-ios.png"

SIZE = 1024          # canonical icon size
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
MASKABLE_MARK_SCALE = 0.50      # inside the 80 % circle Android may mask to
# Adaptive icons show the centre 72/108 of the layer and may mask to a circle
# of 66/108: this keeps the mark the same visual size as on iOS and inside
# that circle. `tauri icon` places the layers as-is, so the shrink happens here.
ANDROID_MARK_SCALE = 0.40

TILE_RADIUS = 0.225             # rounded-tile corner radius as a fraction of size
MAC_INSET = 100                 # Apple's macOS template: 824 px tile on a 1024 canvas


def _transform(mark_scale: float):
    """Return functions mapping mark-grid coordinates to canvas pixels."""
    x0, y0, x1, y1 = MARK_BOX
    mark_w, mark_h = x1 - x0, y1 - y0
    target_w = SIZE * mark_scale
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


def _letter_masks(mark_scale: float = MARK_SCALE):
    to_px, px = _transform(mark_scale)

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


def render(appearance: str = "light", *, mark_scale: float = MARK_SCALE,
           plate: bool | None = None, mark: bool = True) -> Image.Image:
    """Render one appearance at 1024x1024.

    `plate` overrides the recipe (True forces the plate, False drops it);
    `mark=False` renders the plate alone. Opaque RGB with a plate, RGBA without.
    """
    recipe = APPEARANCES[appearance]
    use_plate = recipe["plate"] is not None if plate is None else plate
    if mark:
        g_mask, p_mask = _letter_masks(mark_scale)
        g = np.asarray(g_mask, dtype=np.float32)[..., None] / 255
        p = np.asarray(p_mask, dtype=np.float32)[..., None] / 255
    else:
        g = p = np.zeros((CANVAS, CANVAS, 1), dtype=np.float32)
    t = (np.arange(CANVAS, dtype=np.float32) / CANVAS)[:, None, None]
    p_top, p_bottom = (np.array(c, dtype=np.float32) for c in recipe["p"])
    p_color = p_top * (1 - t) + p_bottom * t
    g_color = np.array(recipe["g"], dtype=np.float32)

    if use_plate:
        rgb = _plate(*(recipe["plate"] or APPEARANCES["light"]["plate"]))
        rgb = rgb * (1 - g) + g_color * g
        rgb = rgb * (1 - p) + p_color * p
        big = Image.fromarray(rgb.astype(np.uint8))
    else:
        # Straight-alpha compositing onto transparency: the `p` sits on top of the `g`.
        alpha = p + g * (1 - p)
        safe = np.where(alpha > 0, alpha, 1)
        rgb = (p_color * p + g_color * g * (1 - p)) / safe
        rgba = np.concatenate([rgb, alpha * 255], axis=-1)
        big = Image.fromarray(rgba.astype(np.uint8))
    return big.resize((SIZE, SIZE), Image.LANCZOS)


def _rounded_mask(size: int, radius_fraction: float, inset: int = 0) -> Image.Image:
    """Anti-aliased rounded-rectangle alpha mask."""
    big = Image.new("L", (size * SS, size * SS), 0)
    ImageDraw.Draw(big).rounded_rectangle(
        (inset * SS, inset * SS, (size - inset) * SS - 1, (size - inset) * SS - 1),
        radius=(size - 2 * inset) * radius_fraction * SS,
        fill=255,
    )
    return big.resize((size, size), Image.LANCZOS)


def rounded_tile(image: Image.Image) -> Image.Image:
    """The 1024 light icon with transparent rounded corners (Windows, Linux, web `any`)."""
    tile = image.convert("RGBA")
    tile.putalpha(_rounded_mask(SIZE, TILE_RADIUS))
    return tile


def macos_tile(image: Image.Image) -> Image.Image:
    """Apple's macOS look: the tile inset on a transparent canvas with a soft shadow."""
    mask = _rounded_mask(SIZE, TILE_RADIUS, MAC_INSET)
    shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    shadow_alpha = Image.new("L", (SIZE, SIZE), 0)
    shadow_alpha.paste(mask, (0, 10))
    shadow_alpha = shadow_alpha.filter(ImageFilter.GaussianBlur(14)).point(lambda v: int(v * 0.30))
    shadow.putalpha(shadow_alpha)
    tile = image.convert("RGBA")
    tile.putalpha(mask)
    out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    out.alpha_composite(shadow)
    out.alpha_composite(tile)
    return out


def _save(image: Image.Image, path: Path, size: int | None = None) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    if size and image.size != (size, size):
        image = image.resize((size, size), Image.LANCZOS)
    image.save(path, optimize=True)
    return path


def write_ios(light: Image.Image) -> list[Path]:
    written = [
        _save(light, APPICONSET / "AppIcon-light.png"),
        _save(render("dark"), APPICONSET / "AppIcon-dark.png"),
        _save(render("tinted"), APPICONSET / "AppIcon-tinted.png"),
        _save(light, SOURCE_OUT),
    ]
    return written


def write_web(light: Image.Image) -> list[Path]:
    tile = rounded_tile(light)
    maskable = render("light", mark_scale=MASKABLE_MARK_SCALE)
    return [
        # Safari has no dark/tinted variants for home-screen web apps; the
        # light plate matches the native icon best.
        _save(light, PUBLIC / "apple-touch-icon.png", 180),
        _save(tile, PUBLIC / "app-icon-192.png", 192),
        _save(tile, PUBLIC / "app-icon-512.png", 512),
        _save(maskable, PUBLIC / "app-icon-maskable-192.png", 192),
        _save(maskable, PUBLIC / "app-icon-maskable-512.png", 512),
    ]


def write_tauri_source(light: Image.Image) -> list[Path]:
    """Layers for `npx tauri icon src-tauri/icon-source/manifest.json`."""
    written = [
        _save(rounded_tile(light), TAURI_SOURCE / "default.png"),
        _save(render("light", mark=False), TAURI_SOURCE / "android-background.png"),
        _save(render("light", plate=False, mark_scale=ANDROID_MARK_SCALE), TAURI_SOURCE / "android-foreground.png"),
        # Android themed icons read only the alpha channel, so a white mark is enough.
        _save(render("tinted", mark_scale=ANDROID_MARK_SCALE), TAURI_SOURCE / "android-monochrome.png"),
    ]
    manifest = TAURI_SOURCE / "manifest.json"
    manifest.write_text(json.dumps({
        "default": "default.png",
        "android_bg": "android-background.png",
        "android_fg": "android-foreground.png",
        "android_fg_scale": 100,
        "android_monochrome": "android-monochrome.png",
    }, indent=2) + "\n")
    written.append(manifest)
    return written


def run_tauri_icon() -> None:
    subprocess.run(
        ["npx", "tauri", "icon", str(TAURI_SOURCE / "manifest.json"), "-o", str(TAURI_ICONS)],
        cwd=ROOT, check=True,
    )
    # `tauri icon` also drops a legacy per-size iOS set into the Xcode catalog.
    # Only what Contents.json declares belongs there, so purge the rest.
    contents = json.loads((APPICONSET / "Contents.json").read_text())
    keep = {"Contents.json", *(entry["filename"] for entry in contents["images"])}
    for stray in APPICONSET.iterdir():
        if stray.name not in keep:
            stray.unlink()


def write_macos_icns(light: Image.Image) -> Path:
    """Build icon.icns with Apple's iconutil from the inset macOS tile."""
    tile = macos_tile(light)
    out = TAURI_ICONS / "icon.icns"
    if shutil.which("iconutil") is None:
        raise SystemExit("iconutil not found: build icon.icns on macOS")
    with tempfile.TemporaryDirectory() as tmp:
        iconset = Path(tmp) / "icon.iconset"
        iconset.mkdir()
        for points in (16, 32, 128, 256, 512):
            _save(tile, iconset / f"icon_{points}x{points}.png", points)
            _save(tile, iconset / f"icon_{points}x{points}@2x.png", points * 2)
        subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(out)], check=True)
    return out


if __name__ == "__main__":
    light = render("light")
    outputs = write_tauri_source(light)
    run_tauri_icon()
    outputs += write_ios(light) + write_web(light)
    outputs.append(write_macos_icns(light))
    for path in outputs:
        print(path.relative_to(ROOT))
