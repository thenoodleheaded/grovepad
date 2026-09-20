import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Domain packs (`types/modulePacks.ts` DOMAIN_PACKS / DOMAIN_PACK_LABELS and
// the blurbs in `DomainPackSettings.tsx`). A pack that is off keeps its
// widgets out of the library; Settings → Data switches them on. Only packs
// that ship a public widget are offered, as on the web.
// ---------------------------------------------------------------------------

public struct DomainPack: Equatable, Identifiable, Sendable {
    public var id: String
    public var label: String
    public var blurb: String
}

public enum DomainPacks {
    /// Web order.
    public static let all: [DomainPack] = [
        DomainPack(id: "game_dev", label: "Game Development", blurb: "Sliders for tuning grip, drift, and feel"),
        DomainPack(id: "music_production", label: "Music Production", blurb: "Synthesizer and audio player — BPM, key, and signal chain"),
        DomainPack(id: "software_eng", label: "Software Engineering", blurb: "50+ automation gates, triggers, variables, webhooks, synthesizers"),
        DomainPack(id: "data_science", label: "Data Science", blurb: "Trend charting, experiment loops, metric reporting"),
        DomainPack(id: "ux_design", label: "UX/UI Design", blurb: "Color palettes, asset generators, layout tools"),
        DomainPack(id: "creative_writing", label: "Creative Writing", blurb: "Script writing templates, dialogue boards, commission pipeline"),
        DomainPack(id: "finance_analytics", label: "Finance & Analytics", blurb: "Budgets, converter, timesheets, inventory, estimates"),
        DomainPack(id: "project_management", label: "Project Management", blurb: "Timelines, SWOT, risk register, process flows, meeting meters"),
        DomainPack(id: "education", label: "Education & Academics", blurb: "Study goals, GPA, assignments, lecture notes, past papers"),
        DomainPack(id: "life", label: "Life Systems", blurb: "Trackers, planners, recipe scale and habit tools"),
    ]

    /// Packs this build can actually fill, each with the widgets it unlocks.
    public static var available: [(pack: DomainPack, widgets: [String])] {
        let definitions = WidgetRegistry.orderedDefinitions().filter(\.isPublic)
        return all.compactMap { pack in
            let widgets = definitions.filter { $0.pack == pack.id }.map(\.label)
            return widgets.isEmpty ? nil : (pack, widgets)
        }
    }
}

extension BoardDocument {
    /// `togglePack`: the pack joins or leaves `activePacks` (appended, as the
    /// web spreads it). Board state, so it saves and syncs like any edit.
    public func togglePack(_ pack: String) {
        let on = board.activePacks.contains(pack)
        commit(on ? "Turn Off Pack" : "Turn On Pack") { board in
            if on { board.activePacks.removeAll { $0 == pack } } else { board.activePacks.append(pack) }
        }
    }
}
