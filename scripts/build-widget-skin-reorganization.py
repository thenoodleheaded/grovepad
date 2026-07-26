#!/usr/bin/env python3
"""Build the complete widget/skin ownership ledger.

The opportunity catalogue deliberately explores broadly. This second pass
answers a stricter product question: which ideas are actually skins, which are
settings or presets, and which deserve another widget because their data or
behaviour is different.
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "widget-skin-opportunity-catalogue.md"
TARGET = ROOT / "docs" / "widget-skin-reorganization.md"
OWNERSHIP_TARGET = ROOT / "src" / "widgets" / "skinOwnership.generated.ts"

HEADING = re.compile(r"^### (.+) \(`([^`]+)`\)$")
PROPOSAL = re.compile(r"^- \*\*(Renderer-ready|Schema-extension) · (.+?)\*\* — (.+)$")


@dataclass(frozen=True)
class Entry:
    source_type: str
    source_label: str
    label: str
    description: str
    implementation: str


NEW_WIDGETS: dict[str, tuple[str, str]] = {
    "location": ("Location", "Reusable coordinates, timezone, accuracy, and map link for circuits."),
    "diff_viewer": ("Diff Viewer", "Before/after text with additions, removals, and patch-oriented outputs."),
    "code_runner": ("Code Runner", "Bounded code execution with inputs, output, errors, and run lifecycle."),
    "work_breakdown": ("Work Breakdown", "Hierarchical deliverables with owners, estimates, and completion."),
    "shift_planner": ("Shift Planner", "People, availability, coverage rules, and assigned shifts."),
    "ranked_poll": ("Ranked Poll", "Ranked ballots and pairwise tallying rather than simple vote counts."),
    "live_poll": ("Live Poll", "Room lifecycle, audience presence, anonymous access, and closing rules."),
    "decision_tournament": ("Decision Tournament", "Persistent brackets and elimination rounds for choices."),
    "consensus_board": ("Consensus Board", "People, objections, consent, and agreement state."),
    "incident_response": ("Incident Response", "Severity, timeline, roles, mitigations, and resolution lifecycle."),
    "workflow_designer": ("Workflow Designer", "Lanes, branches, conditions, and executable process topology."),
    "fmea": ("FMEA", "Failure modes, effects, causes, controls, and risk-priority scoring."),
    "bow_tie": ("Bow-tie Analysis", "Threats and preventive/recovery controls around a central event."),
    "literature_matrix": ("Literature Matrix", "Sources crossed with themes, methods, claims, and evidence."),
    "evidence_map": ("Evidence Map", "Claims, supporting sources, contradictions, and confidence links."),
    "rubric": ("Rubric", "Criteria, performance levels, feedback, and scored submissions."),
    "finance_calculator": ("Finance Calculator", "Cashflow, interest, amortization, and finance-specific inputs."),
    "programmer_calculator": ("Programmer Calculator", "Bases, bit operations, word sizes, and representations."),
    "date_calculator": ("Date Calculator", "Date differences, offsets, business days, and calendar rules."),
    "scatter_plot": ("Scatter Plot", "Paired x/y series, point labels, trends, and correlation outputs."),
    "heatmap": ("Heatmap", "Two-dimensional labelled cells, scales, and intensity thresholds."),
    "database": ("Database", "Typed records with reusable grid, card, board, gallery, form, and pivot views."),
    "video_player": ("Video Player", "Playback position, captions, speed, chapters, and media controls."),
    "document_viewer": ("Document Viewer", "Pages, search, navigation, annotations, and document metadata."),
    "media_gallery": ("Media Gallery", "Multiple assets, ordering, comparison, captions, and presentation views."),
    "screenplay": ("Screenplay", "Scenes, speakers, action, dialogue, and screenplay formatting."),
    "transcript": ("Transcript", "Timestamped speakers, searchable lines, and media alignment."),
    "multi_counter": ("Multi-counter", "Several named counters with independent steps and totals."),
    "rate_meter": ("Rate Meter", "Counts over time with sampling windows and rate outputs."),
    "asset_register": ("Asset Register", "Identity, location, custodian, value, warranty, and service history."),
    "equipment_checkout": ("Equipment Checkout", "Borrower, due date, handoff, condition, and return lifecycle."),
    "url_monitor": ("URL Monitor", "Periodic endpoint checks, response history, and change/failure alerts."),
    "service_status": ("Service Status", "Components, incidents, uptime, maintenance, and public health state."),
    "interval_timer": ("Interval Timer", "Named work/rest stages, rounds, transitions, and multistage timing."),
    "chess_clock": ("Chess Clock", "Two or more competing clocks with turns, increments, and timeouts."),
    "synthesizer": ("Synthesizer", "Oscillators, envelope, filter, keyboard input, and generated audio."),
    "metronome": ("Metronome", "Tempo, meter, accents, subdivisions, and timing pulse outputs."),
    "sampler": ("Sampler", "Multiple clips, pads, trim points, triggering, and playback state."),
    "audio_compare": ("Audio Compare", "Synchronized A/B sources, level matching, and blind comparison."),
}


PROMOTE: dict[tuple[str, str], str] = {
    ("code", "Diff"): "diff_viewer",
    ("code", "Runnable Example"): "code_runner",
    ("outline", "Work Breakdown"): "work_breakdown",
    ("calendar", "Availability"): "shift_planner",
    ("calendar", "Shift Rota"): "shift_planner",
    ("poll", "Ranked Choice"): "ranked_poll",
    ("poll", "Pairwise"): "ranked_poll",
    ("poll", "Live Room"): "live_poll",
    ("decision", "Tournament"): "decision_tournament",
    ("decision", "Elimination"): "decision_tournament",
    ("decision", "Consensus"): "consensus_board",
    ("process", "Incident"): "incident_response",
    ("process", "Swimlane"): "workflow_designer",
    ("process", "Branching Procedure"): "workflow_designer",
    ("risk_register", "FMEA"): "fmea",
    ("risk_register", "Bow-tie"): "bow_tie",
    ("citation", "Literature Matrix"): "literature_matrix",
    ("citation", "Evidence Map"): "evidence_map",
    ("grade_calc", "Rubric"): "rubric",
    ("calculator", "Finance"): "finance_calculator",
    ("calculator", "Programmer"): "programmer_calculator",
    ("calculator", "Date Math"): "date_calculator",
    ("bar_chart", "Scatter"): "scatter_plot",
    ("bar_chart", "Heatmap"): "heatmap",
    ("table", "Database"): "database",
    ("table", "Kanban"): "database",
    ("table", "Gallery"): "database",
    ("table", "Form View"): "database",
    ("table", "Pivot"): "database",
    ("media", "Video"): "video_player",
    ("media", "Document Preview"): "document_viewer",
    ("media", "Before / After"): "media_gallery",
    ("media", "Gallery"): "media_gallery",
    ("media", "Moodboard"): "media_gallery",
    ("dialog", "Screenplay"): "screenplay",
    ("dialog", "Audio Transcript"): "transcript",
    ("counter", "Multi-counter"): "multi_counter",
    ("counter", "Timed Rate"): "rate_meter",
    ("inventory", "Asset Register"): "asset_register",
    ("inventory", "Equipment Checkout"): "equipment_checkout",
    ("links", "Health Monitor"): "url_monitor",
    ("http_request", "Health Check"): "url_monitor",
    ("status", "Service Health"): "service_status",
    ("timekeeper", "Intervals"): "interval_timer",
    ("timekeeper", "Tabata"): "interval_timer",
    ("timekeeper", "Multi-stage Timer"): "interval_timer",
    ("timekeeper", "Chess Clock"): "chess_clock",
    ("audio_player", "Synth"): "synthesizer",
    ("audio_player", "Metronome"): "metronome",
    ("audio_player", "Sampler"): "sampler",
    ("audio_player", "A/B Compare"): "audio_compare",
}


MOVE: dict[tuple[str, str], str] = {
    ("bullets", "Nested Outline"): "Outline",
    ("bullets", "Rolling Log"): "Logbook",
    ("notes", "Daily Log"): "Logbook",
    ("logbook", "Travel Log"): "Trip Itinerary",
    ("calendar", "Birthday & Anniversary"): "Gifts & Occasions",
    ("date_picker", "Anniversary"): "Gifts & Occasions",
    ("process", "Recipe"): "Recipe",
    ("bar_chart", "Gauge"): "Metrics",
    ("bar_chart", "Progress Ring"): "Metrics",
    ("formula", "Weighted Score"): "Decision Matrix",
    ("media", "Audio"): "Audio Player",
    ("contact", "Relationship"): "Keep in Touch",
    ("contact", "Care Contact"): "Care Plan",
    ("links", "Watch Later"): "Reading List",
    ("status", "Approval"): "Approval Gate",
    ("state_machine", "Approval"): "Approval Gate",
    ("state_machine", "Incident"): "Incident Response",
    ("timekeeper", "Lap Timer"): "Stopwatch",
    ("world_clock", "Overlap Band"): "Overlap Finder",
    ("world_clock", "Meeting Planner"): "Overlap Finder",
    ("world_clock", "Travel Clock"): "Jet Lag Plan",
    ("world_clock", "Sunlight"): "Sun Window",
    ("clock_pulse", "Solar"): "Sun Window",
}


CONTROL_WIDGETS = {
    "approval_gate",
    "ai_generator",
    "aggregator",
    "calculator",
    "clock_pulse",
    "comparator",
    "formula",
    "http_request",
    "idempotency_store",
    "latch",
    "mutex",
    "notifier",
    "queue",
    "range_mapper",
    "sequencer",
    "set_store",
    "stack_store",
    "state_machine",
    "template",
    "text_input",
    "unit_converter",
    "webhook_sender",
    "widget_creator",
    "workflow_lock",
}

PRESET_WIDGETS = {
    "contact",
    "form",
    "game_tuner",
    "logbook",
    "meeting_notes",
    "snippet_library",
    "weekly_review",
    "workflow_lock",
}

CONTROL_ENTRIES = {
    ("decision", "Coin / Dice"),
    ("poll", "Approval"),
    ("poll", "Anonymous"),
    ("number_input", "Currency"),
    ("number_input", "Percent"),
    ("number_input", "Duration"),
    ("audio_player", "Loop"),
}

PRESET_ENTRIES = {
    ("budget", "Zero-based"),
    ("budget", "50 / 30 / 20"),
    ("checklist", "Inbox"),
    ("checklist", "Shopping"),
    ("checklist", "Sprint"),
    ("checklist", "Routine"),
    ("links", "Reading Queue"),
    ("links", "Resource List"),
    ("links", "Link-in-bio"),
    ("workout_plan", "Strength"),
    ("workout_plan", "Cardio"),
    ("workout_plan", "Mobility"),
    ("audio_player", "Podcast"),
}


# These 82 choices existed before the 610-item opportunity catalogue. This
# ledger keeps them visible because they are exactly where the largest
# widget-vs-skin mistakes were hiding.
LEGACY_SKINS: dict[str, list[str]] = {
    "notes": ["Plain", "Sticky", "Quote"],
    "checklist": ["List", "Board", "Assignments", "Day", "Week", "Timeline", "Priority Matrix"],
    "decision": ["Simple", "Weighted"],
    "flashcards": ["Flashcards", "Vocabulary", "Quiz"],
    "goal_tracker": ["Simple", "Milestones", "Study Hours", "OKR"],
    "grade_calc": ["Weighted Grade", "GPA"],
    "bar_chart": ["Bar", "Line", "Donut", "Pie"],
    "timekeeper": ["Countdown", "Pomodoro", "Stopwatch"],
    "sketchpad": ["Quick Ink", "Diagram"],
    "date_picker": ["Date & Time", "Countdown"],
    "tracker": [
        "Savings Circle", "Zakat & Giving", "Remittance", "Price Book", "Utility Runway",
        "Fuel Log", "Income Streams", "Wishlist", "Vitals", "Cycle", "Fasting",
        "Hydration", "Sleep Ledger", "Stretch Deck", "Prayer Times", "Scripture Plan",
        "Gratitude Jar", "Prayer Wall", "Power Schedule", "Borrow Ledger", "Plant Shelf",
        "Go Bag", "Bin Night", "Sun Window", "Moving Boxes", "Meeting Meter", "Waiting On",
        "Overlap Finder", "Scope Meter", "Handover", "Crit Room", "On Call", "Estimate",
        "Past Papers", "Memorization", "Experiments", "Mistake Bank", "Skill Tree",
        "Care Plan", "Gift Ledger", "Applause Meter", "Potluck Board", "Star Chart",
        "Pet Card", "Visa Runway", "Packing", "Jet Lag Plan", "Cash Pockets",
        "Commission Queue", "Content Pipeline",
    ],
}

LEGACY_MOVE: dict[tuple[str, str], str] = {
    ("checklist", "Board"): "Kanban",
    ("checklist", "Assignments"): "Assignments",
    ("checklist", "Day"): "Daily Agenda",
    ("checklist", "Week"): "Week Planner",
    ("checklist", "Timeline"): "Timeline",
    ("checklist", "Priority Matrix"): "Priority Matrix",
    ("flashcards", "Vocabulary"): "Vocabulary",
    ("flashcards", "Quiz"): "Quiz",
    ("goal_tracker", "Study Hours"): "Study Goal",
    ("goal_tracker", "OKR"): "OKRs",
    ("grade_calc", "GPA"): "GPA Tracker",
    ("timekeeper", "Countdown"): "Timer",
    ("timekeeper", "Pomodoro"): "Pomodoro Timer",
    ("timekeeper", "Stopwatch"): "Stopwatch",
    ("sketchpad", "Diagram"): "Excalidraw",
    ("date_picker", "Countdown"): "Countdown",
}


def load() -> tuple[list[Entry], list[str]]:
    entries: list[Entry] = []
    order: list[str] = []
    source_type = ""
    source_label = ""
    for line in SOURCE.read_text().splitlines():
        heading = HEADING.match(line)
        if heading:
            source_label, source_type = heading.groups()
            order.append(source_type)
            continue
        proposal = PROPOSAL.match(line)
        if proposal and source_type:
            implementation, label, description = proposal.groups()
            if label != "No Expansion Recommended":
                entries.append(Entry(source_type, source_label, label, description, implementation))
    return entries, order


def slug(label: str) -> str:
    value = label.lower().replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", "_", value).strip("_") or "standard"


def role(entry: Entry) -> tuple[str, str]:
    key = (entry.source_type, entry.label)
    if key in PROMOTE:
        widget = PROMOTE[key]
        return "new-widget", NEW_WIDGETS[widget][0]
    if key in MOVE:
        return "move", MOVE[key]
    if key in CONTROL_ENTRIES:
        return "control", entry.source_label
    if key in PRESET_ENTRIES:
        return "preset", entry.source_label
    if entry.source_type in CONTROL_WIDGETS:
        return "control", entry.source_label
    if entry.source_type in PRESET_WIDGETS:
        return "preset", entry.source_label
    if entry.implementation == "Schema-extension":
        return "capability", entry.source_label
    return "skin", entry.source_label


def render() -> str:
    entries, order = load()
    if len(entries) != 610:
        raise SystemExit(f"Expected 610 opportunity entries, found {len(entries)}")
    if sum(map(len, LEGACY_SKINS.values())) != 82:
        raise SystemExit("Legacy skin inventory must contain 82 entries")

    dispositions = {entry: role(entry) for entry in entries}
    counts = Counter(kind for kind, _ in dispositions.values())
    promoted = defaultdict(list)
    moved = defaultdict(list)
    for entry, (kind, target) in dispositions.items():
        if kind == "new-widget":
            promoted[target].append(f"{entry.source_label} · {entry.label}")
        elif kind == "move":
            moved[target].append(f"{entry.source_label} · {entry.label}")

    lines = [
        "# Grovepad widget and skin reorganization",
        "",
        "> Complete ownership ledger for the 82 original choices and all 610 catalogue proposals. "
        "Generated by `scripts/build-widget-skin-reorganization.py`.",
        "",
        "## The rule",
        "",
        "A **skin** changes how the same stored thing is seen or handled. A **control** changes how "
        "the same tool operates. A **preset** supplies useful starter labels or defaults. A "
        "**capability** extends the same widget’s data. A **template** combines widgets. If an idea "
        "needs its own records, ports, commands, permissions, or lifecycle, it is a **widget**.",
        "",
        "A useful test is: if changing it would make existing information disappear, become invalid, "
        "or mean something different, it is not a skin.",
        "",
        "## Result",
        "",
        f"- **692 choices reviewed**: 82 original choices plus 610 expansion proposals.",
        f"- **{counts['skin']}** expansion ideas remain true visual/view skins.",
        f"- **{counts['capability']}** stay inside their widget as deeper capabilities.",
        f"- **{counts['control']}** become visible controls or settings, not title-roller skins.",
        f"- **{counts['preset']}** become starter presets, not appearance choices.",
        f"- **{counts['move']}** move to an already-existing better owner.",
        f"- **{counts['new-widget']}** proposal entries form **{len(promoted)}** distinct new widget families.",
        f"- **{len(NEW_WIDGETS)}** new widgets are defined in total, including Location.",
        "",
        "## New widget families",
        "",
        "| Widget | Why it is separate | Formerly misfiled ideas |",
        "|---|---|---|",
    ]
    for key, (label, reason) in NEW_WIDGETS.items():
        sources = "; ".join(promoted.get(label, [])) or "New automation source requested directly"
        lines.append(f"| **{label}** (`{key}`) | {reason} | {sources} |")

    lines += [
        "",
        "## Moves to existing widgets",
        "",
        "| Correct owner | Ideas moved there |",
        "|---|---|",
    ]
    for target in sorted(moved):
        lines.append(f"| **{target}** | {'; '.join(moved[target])} |")

    lines += [
        "",
        "## Original 82 choices",
        "",
        "These were the pre-catalogue choices. The large combined cards are split back into searchable "
        "widgets; old boards remain readable through their compatibility types.",
        "",
    ]
    for source_type, labels in LEGACY_SKINS.items():
        lines.append(f"### `{source_type}`")
        lines.append("")
        for label in labels:
            target = LEGACY_MOVE.get((source_type, label))
            if source_type == "tracker":
                lines.append(f"- **Widget → {label}** — this is a complete system with its own fields and commands.")
            elif target:
                lines.append(f"- **Widget → {target}** — distinct data or behaviour, not appearance.")
            elif source_type == "decision":
                lines.append(f"- **Control · {label}** — selection logic inside Decision Picker.")
            else:
                lines.append(f"- **Skin · {label}**")
        lines.append("")

    by_source: dict[str, list[Entry]] = defaultdict(list)
    for entry in entries:
        by_source[entry.source_type].append(entry)

    role_labels = {
        "skin": "Skin",
        "capability": "Capability in this widget",
        "control": "Control / setting",
        "preset": "Starter preset",
        "move": "Move",
        "new-widget": "New widget",
    }
    lines += [
        "## Complete 610-entry ownership ledger",
        "",
        "Every proposal appears once below. The descriptions remain in the "
        "[opportunity catalogue](widget-skin-opportunity-catalogue.md).",
        "",
    ]
    for source_type in order:
        group = by_source.get(source_type)
        if not group:
            continue
        lines.append(f"### {group[0].source_label} (`{source_type}`)")
        lines.append("")
        buckets: dict[tuple[str, str], list[str]] = defaultdict(list)
        for entry in group:
            buckets[dispositions[entry]].append(entry.label)
        for (kind, target), labels in buckets.items():
            suffix = f" → **{target}**" if kind in {"move", "new-widget"} else ""
            lines.append(f"- **{role_labels[kind]}{suffix}:** {', '.join(labels)}.")
        lines.append("")

    lines += [
        "## Runtime changes made with this review",
        "",
        "- Location is a real widget with latitude, longitude, timezone, accuracy, address, map link, "
        "browser location capture, writable coordinate ports, and a Clear command.",
        "- Kanban, Assignments, Daily Agenda, Week Planner, Timeline, Priority Matrix, Vocabulary, Quiz, "
        "Study Goal, OKRs, GPA Tracker, Excalidraw, Random Picker, Timer, Pomodoro, Stopwatch, and "
        "Countdown are searchable widgets again.",
        "- The 50 former Tracker skins are searchable widgets again. The combined Tracker remains only "
        "for old boards and recipes, so no saved data is discarded.",
        "- The combined Timer remains only for old boards. Countdown, Pomodoro, and Stopwatch now have "
        "separate lifecycle-safe homes.",
        "",
        "## Follow-through rule",
        "",
        "The title roller should eventually contain only entries marked **Skin**. Controls belong inside "
        "the card, presets belong in the add flow, and capabilities should appear only once their typed "
        "data and interactions exist. New-widget candidates should not be faked with generic key/value "
        "fields; each needs its declared data, ports, commands, renderer, persistence validation, and tests.",
        "",
    ]
    return "\n".join(lines)


def render_ownership() -> str:
    entries, _ = load()
    catalogue: dict[str, dict[str, dict[str, str]]] = defaultdict(dict)
    for entry in entries:
        value = slug(entry.label)
        suffix = 2
        while value in catalogue[entry.source_type]:
            value = f"{slug(entry.label)}_{suffix}"
            suffix += 1
        kind, target = role(entry)
        catalogue[entry.source_type][value] = {"kind": kind, "target": target}
    encoded = json.dumps(catalogue, indent=2, ensure_ascii=False)
    return f"""// Generated by scripts/build-widget-skin-reorganization.py.
// Source: docs/widget-skin-opportunity-catalogue.md. Do not hand-edit.

export type SkinOwnershipKind =
  | 'skin'
  | 'capability'
  | 'control'
  | 'preset'
  | 'move'
  | 'new-widget'

export interface SkinOwnership {{
  kind: SkinOwnershipKind
  target: string
}}

export const WIDGET_SKIN_OWNERSHIP = {encoded} as const satisfies Record<
  string,
  Readonly<Record<string, SkinOwnership>>
>
"""


def main() -> None:
    TARGET.write_text(render())
    OWNERSHIP_TARGET.write_text(render_ownership())
    print(f"Wrote {TARGET} and {OWNERSHIP_TARGET}")


if __name__ == "__main__":
    main()
