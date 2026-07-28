#!/usr/bin/env python3
"""Build the runtime widget-skin blueprint catalogue from the reviewed product doc.

The Markdown catalogue is intentionally readable by the product owner. This
script turns its structured proposal rows into compact TypeScript so the app
does not carry a second, hand-maintained list of hundreds of skin names.
"""

from __future__ import annotations

import colorsys
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "widget-skin-opportunity-catalogue.md"
TARGET = ROOT / "src" / "widgets" / "skinBlueprints.generated.ts"

HEADING = re.compile(r"^### .+ \(`([^`]+)`\)$")
PROPOSAL = re.compile(
    r"^- \*\*(Renderer-ready|Schema-extension) · (.+?)\*\* — (.+)$"
)

PRESENTATION_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("map", ("map", "route", "location", "spatial", "travel")),
    ("timeline", ("timeline", "agenda", "schedule", "calendar", "chronolog", "year")),
    ("grid", ("grid", "heatmap", "wall", "shelf", "gallery")),
    ("board", ("board", "kanban", "swimlane", "pipeline")),
    ("chart", ("chart", "trend", "graph", "donut", "pie", "burn", "curve")),
    ("matrix", ("matrix", "pairwise", "quadrant", "compare", "comparison", "rubric")),
    ("terminal", ("terminal", "code", "config", "command", "runbook")),
    ("time", ("timer", "clock", "interval", "countdown", "stopwatch", "daily", "weekly")),
    ("form", ("form", "intake", "survey", "questionnaire", "feedback")),
    ("steps", ("step", "sequence", "procedure", "recipe", "workflow")),
    ("cards", ("card", "wallet", "cover", "tile", "gallery")),
    ("compact", ("compact", "chip", "badge", "strip", "one-page", "big number")),
    ("ledger", ("ledger", "list", "log", "register", "table", "inventory", "library")),
    ("dashboard", ("dashboard", "score", "kpi", "hero", "status", "overview")),
    ("media", ("image", "audio", "video", "player", "synth", "photo")),
)

SEMANTIC_HUES: tuple[tuple[int, tuple[str, ...]], ...] = (
    (2, ("risk", "incident", "warning", "overdue", "deny", "failure", "debt")),
    (28, ("time", "clock", "timer", "schedule", "agenda", "deadline")),
    (48, ("priority", "star", "rating", "score", "goal")),
    (145, ("money", "budget", "saving", "income", "growth", "complete", "health")),
    (190, ("data", "table", "grid", "metric", "inventory")),
    (218, ("note", "document", "reading", "study", "reference")),
    (266, ("creative", "media", "synth", "idea", "map")),
    (326, ("mood", "relationship", "gift", "care")),
)


def slug(label: str) -> str:
    value = label.lower().replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", "_", value).strip("_")
    return value or "standard"


def presentation(label: str, description: str) -> str:
    haystack = f"{label} {description}".lower()
    for name, keywords in PRESENTATION_KEYWORDS:
        if any(keyword in haystack for keyword in keywords):
            return name
    return "standard"


def accent(widget_type: str, label: str, description: str) -> str:
    haystack = f"{label} {description}".lower()
    semantic = next(
        (hue for hue, keywords in SEMANTIC_HUES if any(k in haystack for k in keywords)),
        None,
    )
    if semantic is None:
        stable = sum((index + 1) * ord(char) for index, char in enumerate(widget_type + label))
        semantic = stable % 360
    red, green, blue = colorsys.hls_to_rgb(semantic / 360, 0.67, 0.68)
    return f"#{round(red * 255):02x}{round(green * 255):02x}{round(blue * 255):02x}"


def load() -> dict[str, list[dict[str, str]]]:
    result: dict[str, list[dict[str, str]]] = {}
    current_type: str | None = None
    seen: dict[str, set[str]] = {}

    for line in SOURCE.read_text().splitlines():
        heading = HEADING.match(line)
        if heading:
            current_type = heading.group(1)
            result.setdefault(current_type, [])
            seen.setdefault(current_type, set())
            continue

        proposal = PROPOSAL.match(line)
        if not proposal or current_type is None:
            continue

        implementation, label, description = proposal.groups()
        if label == "No Expansion Recommended":
            continue

        value = slug(label)
        suffix = 2
        while value in seen[current_type]:
            value = f"{slug(label)}_{suffix}"
            suffix += 1
        seen[current_type].add(value)

        result[current_type].append(
            {
                "value": value,
                "label": label,
                "description": description,
                "implementation": (
                    "renderer-ready"
                    if implementation == "Renderer-ready"
                    else "schema-extension"
                ),
                "presentation": presentation(label, description),
                "accent": accent(current_type, label, description),
            }
        )
    return result


def render(catalogue: dict[str, list[dict[str, str]]]) -> str:
    encoded = json.dumps(catalogue, indent=2, ensure_ascii=False)
    return f"""// Generated by scripts/build-widget-skin-blueprints.py.
// Source: docs/widget-skin-opportunity-catalogue.md. Do not hand-edit.

export type SkinImplementation = 'renderer-ready' | 'schema-extension'

export type SkinPresentation =
  | 'standard'
  | 'compact'
  | 'cards'
  | 'grid'
  | 'ledger'
  | 'timeline'
  | 'board'
  | 'dashboard'
  | 'form'
  | 'terminal'
  | 'map'
  | 'chart'
  | 'matrix'
  | 'time'
  | 'steps'
  | 'media'

export interface WidgetSkinBlueprint {{
  value: string
  label: string
  description: string
  implementation: SkinImplementation
  presentation: SkinPresentation
  accent: string
}}

export const WIDGET_SKIN_BLUEPRINTS = {encoded} as const satisfies Record<
  string,
  readonly WidgetSkinBlueprint[]
>
"""


def main() -> None:
    catalogue = load()
    count = sum(len(skins) for skins in catalogue.values())
    if len(catalogue) != 94:
        raise SystemExit(f"Expected 94 public widget sections, found {len(catalogue)}")
    if count != 611:
        raise SystemExit(f"Expected 611 implementable skins, found {count}")
    TARGET.write_text(render(catalogue))
    print(f"Wrote {count} skins for {len(catalogue)} widgets to {TARGET}")


if __name__ == "__main__":
    main()
