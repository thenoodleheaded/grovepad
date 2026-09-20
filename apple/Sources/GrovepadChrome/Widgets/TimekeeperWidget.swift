import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Time (`components/widgets/modules/TimekeeperWidget.tsx` and the retired
// `Timer`/`Pomodoro`/`Stopwatch`/`Countdown`/`WorldClock` widgets it hosts,
// `timeSkinModel.ts`, `utils/widgetClock.ts`, `restingFaces/time.ts`). One
// persistent toolbox: every clock keeps its own pocket (`countdown`,
// `pomodoro`, `stopwatch`, `deadline`, `worldClock`), so changing the skin
// never discards another clock. The skin field is `mode`.
//
// Ticking comes from the injected `SharedClock` (one beat for every card);
// the dial reading is `TimekeeperClock.reading`, the port of `widgetClock`,
// so the open card, the folded tile and the `running` port agree. Starting
// and pausing write `endAt`/`startedAt` exactly as the web does; `reset` on
// the stopwatch and the countdown IS the Core command; `add_zone` runs the
// Core command with its payload so a tap and a wire validate the same way.
//
// Ported skins: countdown, hourglass (the countdown pocket), pomodoro,
// stopwatch, lap_timer (the stopwatch pocket), deadline, world_clock.
// intervals, tabata, chess_clock and multi_stage_timer render their pocket's
// reading with Reset (the command) and a note; the pocket is not edited.
// ---------------------------------------------------------------------------

public struct TimekeeperWidget: WidgetRenderer {
    public static let type = "timekeeper"
    static let modes: Set<String> = ["countdown", "pomodoro", "stopwatch", "deadline", "world_clock", "hourglass", "intervals", "tabata", "chess_clock", "lap_timer", "multi_stage_timer"]
    static let minDuration = 30.0
    static let maxDuration = 4 * 3600.0
    static let zoneChoices: [(tz: String, label: String)] = [
        ("America/Los_Angeles", "Los Angeles"), ("America/Chicago", "Chicago"), ("America/New_York", "New York"), ("America/Sao_Paulo", "São Paulo"),
        ("UTC", "UTC"), ("Europe/London", "London"), ("Europe/Paris", "Paris"), ("Europe/Moscow", "Moscow"), ("Asia/Dubai", "Dubai"),
        ("Asia/Kolkata", "Mumbai"), ("Asia/Shanghai", "Shanghai"), ("Asia/Singapore", "Singapore"), ("Asia/Tokyo", "Tokyo"),
        ("Australia/Sydney", "Sydney"), ("Pacific/Auckland", "Auckland"),
    ]

    public init() {}

    /// `timekeeperMode`.
    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("mode")
        return modes.contains(raw) ? raw : "countdown"
    }

    /// `zoneLabel`: the catalogue's word, else the last path segment.
    static func zoneLabel(_ tz: String) -> String {
        if let known = zoneChoices.first(where: { $0.tz == tz }) { return known.label }
        return (tz.split(separator: "/").last.map(String.init) ?? tz).replacingOccurrences(of: "_", with: " ")
    }

    /// `zoneReading`: the zone's `en-GB` clock and whether it is on another day.
    static func zoneReading(_ tz: String, nowMs: Double) -> (valid: Bool, time: String, dayDelta: Int) {
        guard let zone = TimeZone(identifier: tz) else { return (false, "--:--", 0) }
        let now = Date(timeIntervalSince1970: nowMs / 1000)
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_GB")
        formatter.timeZone = zone
        formatter.dateFormat = "HH:mm"
        let day = DateFormatter()
        day.locale = Locale(identifier: "en_US_POSIX")
        day.dateFormat = "yyyy-MM-dd"
        day.timeZone = TimeZone.current
        let local = day.string(from: now)
        day.timeZone = zone
        let zoned = day.string(from: now)
        return (true, formatter.string(from: now), zoned == local ? 0 : zoned > local ? 1 : -1)
    }

    static func zones(_ data: JSONObject) -> [String] {
        (data.object("worldClock")?.array("zones") ?? []).compactMap(\.stringValue)
    }

    // MARK: - Pocket readings (`timeSkinModel.ts`, bounded)

    static func bounded(_ raw: JSONValue?, _ fallback: Double, _ low: Double, _ high: Double) -> Double {
        let value = raw?.numberValue.flatMap { $0.isFinite ? $0 : nil } ?? fallback
        return min(high, max(low, jsRound(value)))
    }

    struct IntervalState {
        var workSeconds: Double, restSeconds: Double, rounds: Double, currentRound: Double
        var phase: String, remainingSeconds: Double, durationSeconds: Double, endAt: Double?
    }

    static func intervalState(_ raw: JSONObject, preset: String) -> IntervalState {
        let defaults = preset == "tabata" ? (work: 20.0, rest: 10.0, rounds: 8.0) : (work: 300.0, rest: 60.0, rounds: 4.0)
        let work = bounded(raw["workSeconds"], defaults.work, 5, 7200)
        let rest = bounded(raw["restSeconds"], defaults.rest, 5, 3600)
        let phase = raw.string("phase") == "rest" ? "rest" : "work"
        let phaseDuration = phase == "work" ? work : rest
        return IntervalState(
            workSeconds: work, restSeconds: rest, rounds: bounded(raw["rounds"], defaults.rounds, 1, 99), currentRound: bounded(raw["currentRound"], 1, 1, 99),
            phase: phase, remainingSeconds: bounded(raw["remainingSeconds"], phaseDuration, 0, 7200), durationSeconds: bounded(raw["durationSeconds"], phaseDuration, 1, 7200),
            endAt: raw.number("endAt").flatMap { $0.isFinite ? $0 : nil }
        )
    }

    struct ChessState {
        var playerOne: String, playerTwo: String, durationSeconds: Double, remainingMs: [Double], active: Int?, startedAt: Double?
    }

    static func chessState(_ raw: JSONObject) -> ChessState {
        let duration = bounded(raw["durationSeconds"], 300, 30, 10_800)
        let remaining = raw.array("remainingMs") ?? []
        let active: Int? = raw.number("active") == 0 ? 0 : raw.number("active") == 1 ? 1 : nil
        func name(_ key: String, _ fallback: String) -> String {
            let value = JavaScript.trim(raw.str(key))
            return value.isEmpty ? fallback : String(value.prefix(48))
        }
        return ChessState(
            playerOne: name("playerOne", "White"), playerTwo: name("playerTwo", "Black"), durationSeconds: duration,
            remainingMs: [bounded(remaining.first, duration * 1000, 0, 10_800_000), bounded(remaining.count > 1 ? remaining[1] : nil, duration * 1000, 0, 10_800_000)],
            active: active, startedAt: active != nil ? raw.number("startedAt").flatMap { $0.isFinite ? $0 : nil } : nil
        )
    }

    static func chessRemaining(_ state: ChessState, nowMs: Double) -> [Double] {
        var result = state.remainingMs
        if let active = state.active, let startedAt = state.startedAt {
            result[active] = max(0, result[active] - (nowMs - startedAt))
        }
        return result
    }

    struct Stage { var id: String, label: String, durationSeconds: Double }

    static func stages(_ raw: JSONObject) -> (stages: [Stage], activeIndex: Int) {
        var list: [Stage] = []
        for (index, item) in (raw.array("stages") ?? []).prefix(8).enumerated() {
            let stage = item.objectValue ?? JSONObject()
            let id = JavaScript.trim(stage.str("id"))
            let label = JavaScript.trim(stage.str("label"))
            list.append(Stage(id: id.isEmpty ? "stage-\(index + 1)" : String(id.prefix(64)), label: label.isEmpty ? "Stage \(index + 1)" : String(label.prefix(48)), durationSeconds: bounded(stage["durationSeconds"], 60, 5, 7200)))
        }
        if list.isEmpty {
            list = [Stage(id: "prepare", label: "Prepare", durationSeconds: 60), Stage(id: "focus", label: "Focus", durationSeconds: 300), Stage(id: "recover", label: "Recover", durationSeconds: 60)]
        }
        return (list, Int(bounded(raw["activeIndex"], 0, 0, Double(list.count - 1))))
    }

    /// `deadlineReading`'s label: "Sep 24", with the year when it differs.
    static func deadlineLabel(_ target: String, nowMs: Double) -> String {
        guard let start = DateSkinModel.dayStart(target) else { return "Choose a date" }
        let now = Date(timeIntervalSince1970: nowMs / 1000)
        let sameYear = Calendar.current.component(.year, from: start) == Calendar.current.component(.year, from: now)
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = TimeZone.current
        formatter.setLocalizedDateFormatFromTemplate(sameYear ? "MMMd" : "MMMdy")
        return formatter.string(from: start)
    }

    // MARK: - Body

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let mode = TimekeeperWidget.skin(data)
        let accent = Color(hex: context.accent)
        return Group {
            switch mode {
            case "countdown", "hourglass":
                countdownBody(context, mode: mode, accent: accent)
            case "pomodoro":
                pomodoroBody(context, accent: accent)
            case "stopwatch", "lap_timer":
                stopwatchBody(context, mode: mode, accent: accent)
            case "deadline":
                deadlineBody(context, accent: accent)
            case "world_clock":
                worldClockBody(context, accent: accent)
            default:
                pocketBody(context, mode: mode, accent: accent)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    /// The dial: an accent ring with the readout inside, the way the card's
    /// outline carries the marks on the web.
    private func dial(_ reading: TimekeeperClock, accent: Color) -> some View {
        let tint = reading.tone == "break" ? Color(hex: "#34d399") : reading.urgent ? Color(hex: "#f87171") : accent
        return ZStack {
            Circle().strokeBorder(Color.lift.opacity(0.08), lineWidth: 6)
            Circle().trim(from: 0, to: CGFloat(reading.fraction)).stroke(tint, style: StrokeStyle(lineWidth: 6, lineCap: .round)).rotationEffect(.degrees(-90))
            VStack(spacing: 2) {
                Text(reading.readout).font(GlassType.hero).monospacedDigit().foregroundStyle(tint).lineLimit(1).minimumScaleFactor(0.6)
                Text(reading.caption.uppercased()).font(GlassType.label).tracking(0.8).foregroundStyle(.secondary)
            }
            .padding(14)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 112)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(reading.readout), \(reading.caption)")
    }

    private func transport(_ running: Bool, toggle: @escaping () -> Void, reset: @escaping () -> Void, canStart: Bool = true, extra: (symbol: String, label: String, action: () -> Void)? = nil) -> some View {
        HStack(spacing: 8) {
            GhostButton("arrow.counterclockwise", label: "Reset", action: reset)
            Button(action: toggle) {
                Image(systemName: running ? "pause.fill" : "play.fill")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Color.primary)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Color.lift.opacity(0.12)))
            }
            .buttonStyle(.plain)
            .disabled(!running && !canStart)
            .accessibilityLabel(running ? "Pause" : "Start")
            .touchTarget()
            if let extra {
                GhostButton(extra.symbol, label: extra.label, action: extra.action)
            } else {
                Color.clear.frame(width: 44, height: 44)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func countdownBody(_ context: WidgetCardContext, mode: String, accent: Color) -> some View {
        ClockReader { now in
            let data = context.data
            let pocket = data.object("countdown") ?? JSONObject()
            let reading = TimekeeperClock.timer(pocket, nowMs: now)
            let remaining = reading.remainingSeconds
            VStack(spacing: 8) {
                if mode == "hourglass" { SkinNote("Quiet timer — drawn as the countdown dial.") }
                dial(reading, accent: accent)
                    .onChange(of: remaining) { _, next in
                        // Auto-pause the instant the countdown hits zero.
                        if reading.running, next <= 0 {
                            context.update { data in
                                var pocket = data.object("countdown") ?? JSONObject()
                                pocket["endAt"] = .null
                                pocket["remainingSeconds"] = .number(0)
                                data["countdown"] = .object(pocket)
                            }
                        }
                    }
                transport(reading.running, toggle: {
                    context.update { data in
                        var pocket = data.object("countdown") ?? JSONObject()
                        if reading.running {
                            pocket["endAt"] = .null
                            pocket["remainingSeconds"] = .number(remaining)
                        } else if remaining > 0 {
                            pocket["endAt"] = .number(Clock.system.nowMs() + remaining * 1000)
                        } else {
                            return
                        }
                        data["countdown"] = .object(pocket)
                    }
                }, reset: { context.runCommand("reset") }, canStart: remaining > 0)
                HStack(spacing: 8) {
                    GhostButton("minus", label: "One minute less") { adjustDuration(context, by: -60) }
                    CardTextField("Label", text: pocket.str("label")) { next in
                        context.update { data in
                            var pocket = data.object("countdown") ?? JSONObject()
                            pocket["label"] = .string(next)
                            data["countdown"] = .object(pocket)
                        }
                    }
                    .multilineTextAlignment(.center)
                    GhostButton("plus", label: "One minute more") { adjustDuration(context, by: 60) }
                }
            }
        }
    }

    /// `adjustDuration`: clamp 30 s … 4 h, reset the remainder, stop the clock.
    private func adjustDuration(_ context: WidgetCardContext, by delta: Double) {
        context.update { data in
            var pocket = data.object("countdown") ?? JSONObject()
            let next = min(TimekeeperWidget.maxDuration, max(TimekeeperWidget.minDuration, (pocket.finite("durationSeconds") ?? 0) + delta))
            pocket["durationSeconds"] = .number(next)
            pocket["remainingSeconds"] = .number(next)
            pocket["endAt"] = .null
            data["countdown"] = .object(pocket)
        }
    }

    private func pomodoroBody(_ context: WidgetCardContext, accent: Color) -> some View {
        ClockReader { now in
            let data = context.data
            let pocket = data.object("pomodoro") ?? JSONObject()
            let reading = TimekeeperClock.pomodoro(pocket, nowMs: now)
            let remaining = reading.remainingSeconds
            let completed = Int(max(0, pocket.finite("completed") ?? 0))
            VStack(spacing: 8) {
                dial(reading, accent: accent)
                    .onChange(of: remaining) { _, next in
                        // Reaching zero advances the phase (crediting a session
                        // when a work block finishes) and pauses there.
                        if reading.running, next <= 0 {
                            context.update { data in
                                var pocket = data.object("pomodoro") ?? JSONObject()
                                let nextIsWork = pocket.string("phase") != "work"
                                let minutes = nextIsWork ? pocket.finite("workMinutes") : pocket.finite("breakMinutes")
                                pocket["phase"] = .string(nextIsWork ? "work" : "break")
                                pocket["endAt"] = .null
                                pocket["remainingSeconds"] = .number((minutes ?? 25) * 60)
                                if !nextIsWork { pocket["completed"] = .number((pocket.finite("completed") ?? 0) + 1) }
                                data["pomodoro"] = .object(pocket)
                            }
                        }
                    }
                if completed > 0 {
                    HStack(spacing: 4) {
                        ForEach(0..<min(completed, 8), id: \.self) { _ in Circle().fill(accent).frame(width: 6, height: 6) }
                        if completed > 8 { Text("+\(completed - 8)").font(GlassType.label).foregroundStyle(.secondary) }
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(completed) session\(completed == 1 ? "" : "s") done")
                }
                transport(reading.running, toggle: {
                    context.update { data in
                        var pocket = data.object("pomodoro") ?? JSONObject()
                        if reading.running {
                            pocket["endAt"] = .null
                            pocket["remainingSeconds"] = .number(remaining)
                        } else if remaining > 0 {
                            pocket["endAt"] = .number(Clock.system.nowMs() + remaining * 1000)
                        } else {
                            return
                        }
                        data["pomodoro"] = .object(pocket)
                    }
                }, reset: {
                    // "Reset phase": the phase's full length, sessions kept.
                    context.update { data in
                        var pocket = data.object("pomodoro") ?? JSONObject()
                        let isWork = pocket.string("phase") == "work"
                        let minutes = (isWork ? pocket.finite("workMinutes") : pocket.finite("breakMinutes")) ?? (isWork ? 25 : 5)
                        pocket["endAt"] = .null
                        pocket["remainingSeconds"] = .number(minutes * 60)
                        data["pomodoro"] = .object(pocket)
                    }
                }, canStart: remaining > 0)
                HStack(spacing: 8) {
                    ForEach(["workMinutes", "breakMinutes"], id: \.self) { key in
                        VStack(alignment: .leading, spacing: 2) {
                            GlassLabel(key == "workMinutes" ? "Work min" : "Break min")
                            CardTextField(key, text: JavaScript.numberString(pocket.finite(key) ?? (key == "workMinutes" ? 25 : 5))) { next in
                                let parsed = JavaScript.parseFloat(next)
                                guard parsed.isFinite, parsed >= 1 else { return }
                                context.update { data in
                                    var pocket = data.object("pomodoro") ?? JSONObject()
                                    pocket[key] = .number(jsRound(parsed))
                                    data["pomodoro"] = .object(pocket)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private func stopwatchBody(_ context: WidgetCardContext, mode: String, accent: Color) -> some View {
        ClockReader { now in
            let data = context.data
            let pocket = data.object("stopwatch") ?? JSONObject()
            let reading = TimekeeperClock.stopwatch(pocket, nowMs: now)
            let elapsed = reading.elapsedMs
            let laps = (pocket.array("laps") ?? []).compactMap { $0.numberValue }.filter(\.isFinite)
            VStack(spacing: 8) {
                dial(reading, accent: accent)
                transport(reading.running, toggle: {
                    context.update { data in
                        var pocket = data.object("stopwatch") ?? JSONObject()
                        if reading.running {
                            pocket["elapsedMs"] = .number(elapsed)
                            pocket["startedAt"] = .null
                        } else {
                            pocket["startedAt"] = .number(Clock.system.nowMs())
                        }
                        data["stopwatch"] = .object(pocket)
                    }
                }, reset: { context.runCommand("reset") }, extra: (symbol: "flag", label: "Record lap", action: {
                    context.update { data in
                        var pocket = data.object("stopwatch") ?? JSONObject()
                        pocket["laps"] = .array((pocket.array("laps") ?? []) + [.number(elapsed)])
                        data["stopwatch"] = .object(pocket)
                    }
                }))
                if mode == "lap_timer" || !laps.isEmpty {
                    VStack(alignment: .leading, spacing: 2) {
                        GlassLabel("\(laps.count) split\(laps.count == 1 ? "" : "s")")
                        ForEach(Array(laps.suffix(4).enumerated().reversed()), id: \.offset) { offset, lap in
                            let index = laps.count - laps.suffix(4).count + offset
                            let split = lap - (index > 0 ? laps[index - 1] : 0)
                            HStack {
                                Text("Lap \(index + 1)").font(GlassType.label).foregroundStyle(.secondary)
                                Spacer()
                                Text(formatStopwatch(split)).font(GlassType.body).monospacedDigit()
                                Text(formatStopwatch(lap)).font(GlassType.label).monospacedDigit().foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
    }

    private func deadlineBody(_ context: WidgetCardContext, accent: Color) -> some View {
        ClockReader { now in
            let data = context.data
            let pocket = data.object("deadline") ?? JSONObject()
            let target = pocket.str("targetDate")
            let valid = DateSkinModel.dayStart(target) != nil
            let days = fieldDescriptor("timekeeper", "days_left").map { num($0.get(data)) } ?? 0
            let overdue = valid && days < 0
            VStack(spacing: 8) {
                VStack(spacing: 2) {
                    Text(valid ? (overdue ? "+\(RestText.number(abs(days)))" : RestText.number(days)) : "—")
                        .font(GlassType.hero).monospacedDigit().foregroundStyle(overdue ? Color(hex: "#f87171") : accent)
                    Text((valid ? (overdue ? "Days overdue" : days == 1 ? "Day left" : "Days left") : "No date set").uppercased())
                        .font(GlassType.label).tracking(0.8).foregroundStyle(.secondary)
                    Text(TimekeeperWidget.deadlineLabel(target, nowMs: now)).font(GlassType.body).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, minHeight: 88)
                CardTextField("Label", text: pocket.str("label")) { next in
                    context.update { data in
                        var pocket = data.object("deadline") ?? JSONObject()
                        pocket["label"] = .string(next)
                        data["deadline"] = .object(pocket)
                    }
                }
                HStack(spacing: 8) {
                    GlassLabel("Date").frame(width: 40)
                    CardTextField("Target date (YYYY-MM-DD)", text: target) { next in
                        context.update { data in
                            var pocket = data.object("deadline") ?? JSONObject()
                            pocket["targetDate"] = .string(next)
                            data["deadline"] = .object(pocket)
                        }
                    }
                }
            }
        }
    }

    private func worldClockBody(_ context: WidgetCardContext, accent: Color) -> some View {
        ClockReader { now in
            let zones = TimekeeperWidget.zones(context.data)
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    GlassLabel("World clock")
                    Text("\(zones.count) \(zones.count == 1 ? "city" : "cities")").font(GlassType.label).foregroundStyle(.secondary)
                }
                ForEach(Array(zones.enumerated()), id: \.offset) { _, tz in
                    let reading = TimekeeperWidget.zoneReading(tz, nowMs: now)
                    HStack(spacing: 8) {
                        Text(TimekeeperWidget.zoneLabel(tz)).font(GlassType.body).lineLimit(1)
                        Spacer(minLength: 4)
                        if reading.dayDelta != 0 {
                            Text(reading.dayDelta > 0 ? "+1" : "−1").font(GlassType.label).foregroundStyle(Color(hex: "#f59e0b"))
                        }
                        Text(reading.time).font(GlassType.value).foregroundStyle(reading.valid ? accent : .secondary)
                        RowDeleteButton(label: "Remove \(TimekeeperWidget.zoneLabel(tz))") {
                            context.update { data in
                                var pocket = data.object("worldClock") ?? JSONObject()
                                pocket["zones"] = .array(zones.filter { $0 != tz }.map { .string($0) })
                                data["worldClock"] = .object(pocket)
                            }
                        }
                    }
                }
                Menu {
                    ForEach(TimekeeperWidget.zoneChoices.filter { !zones.contains($0.tz) }, id: \.tz) { choice in
                        Button(choice.label) {
                            // The Core `add_zone` command with its payload: a tap validates like a wire.
                            context.update { data in
                                if let command = commandsFor("timekeeper").first(where: { $0.key == "add_zone" }) {
                                    data = command.run(data, .text(choice.tz), context.mint)
                                }
                            }
                        }
                    }
                } label: {
                    Label("Add city", systemImage: "plus").font(GlassType.body).foregroundStyle(accent).frame(minHeight: GlassTokens.touchTarget)
                }
                .menuStyle(.button)
                .buttonStyle(.plain)
                .touchTarget()
            }
        }
    }

    /// intervals, tabata, chess_clock, multi_stage_timer: the pocket's own
    /// reading, Reset (the Core command clears the pocket), and a note.
    private func pocketBody(_ context: WidgetCardContext, mode: String, accent: Color) -> some View {
        ClockReader { now in
            let data = context.data
            let pocket = data.skinState(mode)
            VStack(alignment: .leading, spacing: 8) {
                SkinNote("\(mode.replacingOccurrences(of: "_", with: " ").capitalized) shows its reading here; editing it arrives later.")
                switch mode {
                case "intervals", "tabata":
                    let state = TimekeeperWidget.intervalState(pocket, preset: mode)
                    let reading = TimekeeperClock.timer(pocket, nowMs: now, fallback: state.remainingSeconds)
                    HStack {
                        GlassLabel(mode == "tabata" ? "Tabata" : "Intervals")
                        Text("\(state.phase == "work" ? "Work" : "Rest") \(RestText.number(state.currentRound))/\(RestText.number(state.rounds))").font(GlassType.label).foregroundStyle(.secondary)
                    }
                    dial(reading, accent: accent)
                case "chess_clock":
                    let state = TimekeeperWidget.chessState(pocket)
                    let remaining = TimekeeperWidget.chessRemaining(state, nowMs: now)
                    HStack(spacing: 8) {
                        ForEach(0..<2, id: \.self) { side in
                            VStack(spacing: 2) {
                                Text(formatClock(remaining[side] / 1000)).font(GlassType.hero).monospacedDigit().foregroundStyle(state.active == side ? accent : Color.primary.opacity(0.8))
                                Text(side == 0 ? state.playerOne : state.playerTwo).font(GlassType.label).foregroundStyle(.secondary).lineLimit(1)
                            }
                            .frame(maxWidth: .infinity)
                        }
                    }
                default:
                    let (stages, active) = TimekeeperWidget.stages(pocket)
                    HStack {
                        GlassLabel("Stages")
                        Text("\(min(active + 1, stages.count))/\(stages.count)").font(GlassType.label).foregroundStyle(.secondary)
                    }
                    ForEach(Array(stages.enumerated()), id: \.element.id) { index, stage in
                        HStack {
                            Text(String(format: "%02d", index + 1)).font(GlassType.label).monospacedDigit().foregroundStyle(index == active ? accent : .secondary)
                            Text(stage.label).font(GlassType.body).lineLimit(1)
                            Spacer()
                            Text(formatClock(stage.durationSeconds)).font(GlassType.label).monospacedDigit().foregroundStyle(.secondary)
                        }
                    }
                }
                GhostButton("arrow.counterclockwise", label: "Reset") { context.runCommand("reset") }
            }
        }
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// `timekeeperRestingFace`: the three dial modes rest as the readout inside
    /// the bezel (the renderer reads the clock pocket at paint time; a bitmap
    /// holds the instant it was folded), the deadline as a gauge of the
    /// run-up spent, a chess clock as its two sides, intervals / stages / laps
    /// / the hourglass as the readout with their own context hung off it.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let mode = TimekeeperWidget.skin(data)
        let now = FieldClock.nowMs()
        switch mode {
        case "deadline":
            let target = data.object("deadline")?.str("targetDate") ?? ""
            guard DateSkinModel.dayStart(target) != nil else { return .gauge(progress: 0, primary: "—", secondary: "No date set") }
            let days = fieldDescriptor("timekeeper", "days_left").map { num($0.get(data)) } ?? 0
            let overdue = days < 0
            // A horizon reads as how much of the run-up is spent, capped at a
            // season so a date years out still shows movement.
            let spent = RestText.fraction(1 - min(days, 90) / 90)
            return .gauge(
                progress: overdue ? 1 : spent,
                primary: overdue ? "+\(RestText.number(abs(days)))" : RestText.number(days),
                secondary: overdue ? "Days overdue" : days == 1 ? "Day left" : "Days left",
                caption: RestText.compact(TimekeeperWidget.deadlineLabel(target, nowMs: now), 22),
                tone: overdue ? .bad : days <= 3 ? .warn : .accent
            )
        case "world_clock":
            let zones = Array(TimekeeperWidget.zones(data).prefix(RestingFaceMeasure.rowLimit))
            if zones.isEmpty { return .icon }
            return .rows(
                rows: zones.enumerated().map { index, tz in
                    let reading = TimekeeperWidget.zoneReading(tz, nowMs: now)
                    return RestRow(key: "\(tz)-\(index)", label: RestText.compact(TimekeeperWidget.zoneLabel(tz), 20), value: reading.valid ? reading.time : "--:--", tone: reading.dayDelta == 0 ? nil : .warn)
                },
                overflow: 0,
                eyebrow: RestEyebrow(label: "World clock", note: "\(zones.count) \(zones.count == 1 ? "city" : "cities")")
            )
        case "chess_clock":
            let state = TimekeeperWidget.chessState(data.skinState(mode))
            let remaining = TimekeeperWidget.chessRemaining(state, nowMs: now)
            return .split(
                left: RestReadout(primary: RestText.duration(remaining[0] / 1000), secondary: RestText.compact(state.playerOne, 12), tone: state.active == 0 ? .accent : remaining[0] <= 30_000 ? .bad : nil),
                right: RestReadout(primary: RestText.duration(remaining[1] / 1000), secondary: RestText.compact(state.playerTwo, 12), tone: state.active == 1 ? .accent : remaining[1] <= 30_000 ? .bad : nil),
                divider: "vs",
                eyebrow: RestEyebrow(label: "Chess clock", note: state.active == nil ? "Paused" : "Running")
            )
        case "intervals", "tabata":
            let state = TimekeeperWidget.intervalState(data.skinState(mode), preset: mode)
            let rounds = Int(state.rounds)
            let current = Int(state.currentRound)
            let working = state.phase == "work"
            let phaseTone: RestTone = working ? .bad : .good
            // One pip per round, the round you are on filled.
            var chips: [RestChip] = []
            for index in 0..<min(RestingFaceMeasure.chipLimit, rounds) {
                let tone: RestTone = index == current - 1 ? phaseTone : .muted
                chips.append(RestChip(key: "round-\(index)", text: String(index + 1), tone: tone, filled: index < current))
            }
            let phase = working ? "Work" : "Rest"
            let eyebrow = RestEyebrow(label: mode == "tabata" ? "Tabata" : "Intervals", note: "\(phase) \(current)/\(rounds)", tone: phaseTone)
            let plan = RestRow(key: "plan", label: "\(RestText.duration(state.workSeconds)) on", value: "\(RestText.duration(state.restSeconds)) off", tone: .muted)
            return .clock(shape: .intervals, eyebrow: eyebrow, chips: chips, rows: [plan])
        case "multi_stage_timer":
            let (stages, active) = TimekeeperWidget.stages(data.skinState(mode))
            return .clock(
                shape: .stages,
                eyebrow: RestEyebrow(label: "Stages", note: "\(min(active + 1, stages.count))/\(stages.count)"),
                chips: stages.prefix(RestingFaceMeasure.chipLimit).enumerated().map { index, stage in
                    RestChip(key: stage.id, text: RestText.compact(stage.label, 10), tone: index == active ? .accent : .muted, filled: index == active)
                }
            )
        case "lap_timer":
            let laps = ((data.object("stopwatch") ?? JSONObject()).array("laps") ?? []).compactMap { $0.numberValue }.filter(\.isFinite)
            // Newest splits first, each as the gap it actually measured.
            let recent = Array(laps.suffix(3).enumerated().reversed())
            let first = laps.count - laps.suffix(3).count
            var rows: [RestRow] = []
            for (offset, lap) in recent {
                let index = first + offset
                let previous: Double = index > 0 ? laps[index - 1] : 0
                let tone: RestTone = index == laps.count - 1 ? .accent : .muted
                rows.append(RestRow(key: "lap-\(index)", label: "Lap \(index + 1)", value: formatStopwatch(lap - previous), tone: tone))
            }
            let word = laps.count == 1 ? "split" : "splits"
            return .clock(shape: .laps, eyebrow: RestEyebrow(label: "Lap timer", note: "\(laps.count) \(word)"), rows: rows)
        case "hourglass":
            let pocket = data.object("countdown") ?? JSONObject()
            let duration = pocket.finite("durationSeconds") ?? 0
            let ready = pocket["endAt"] == nil || pocket["endAt"] == .null
            return .clock(
                shape: .hourglass,
                eyebrow: RestEyebrow(label: "Quiet timer", note: ready ? "Ready" : "Sand is falling"),
                rows: duration > 0 ? [RestRow(key: "set", label: "Set for", value: RestText.duration(duration), tone: .muted)] : []
            )
        default:
            // countdown, pomodoro, stopwatch: the card's own outline carries the
            // marks, so the tile is the readout sitting inside the bezel.
            return .clock(shape: .dial)
        }
    }
}

// MARK: - The dial reading (`utils/widgetClock.ts`)

/// One pure reading answers everything a dial needs, so a running timer can
/// never look like three different times in three places.
public struct TimekeeperClock: Equatable {
    public var fraction: Double
    public var running: Bool
    /// `work` / `break` / `neutral`.
    public var tone: String
    public var readout: String
    public var caption: String
    public var urgent: Bool
    /// The whole seconds the readout was made from (timers).
    public var remainingSeconds: Double
    /// The elapsed milliseconds the readout was made from (stopwatch).
    public var elapsedMs: Double

    static func timer(_ pocket: JSONObject, nowMs: Double, fallback: Double? = nil) -> TimekeeperClock {
        let endAt = pocket.finite("endAt")
        let running = endAt != nil
        let remaining = running ? max(0, jsRound((endAt! - nowMs) / 1000)) : (pocket.finite("remainingSeconds") ?? fallback ?? 0)
        let duration = max(1, pocket.finite("durationSeconds") ?? fallback ?? remaining)
        return TimekeeperClock(
            fraction: RestText.fraction(remaining / duration), running: running, tone: "neutral", readout: formatClock(remaining),
            caption: running ? "Left" : remaining > 0 ? "Ready" : "Done", urgent: remaining <= 10 && remaining > 0, remainingSeconds: remaining, elapsedMs: 0
        )
    }

    static func pomodoro(_ pocket: JSONObject, nowMs: Double) -> TimekeeperClock {
        let endAt = pocket.finite("endAt")
        let running = endAt != nil
        let remaining = running ? max(0, jsRound((endAt! - nowMs) / 1000)) : (pocket.finite("remainingSeconds") ?? 0)
        let isWork = pocket.string("phase") != "break"
        let minutes = isWork ? pocket.finite("workMinutes") : pocket.finite("breakMinutes")
        let phaseLength = max(1, (minutes ?? 25) * 60)
        return TimekeeperClock(
            fraction: RestText.fraction(remaining / phaseLength), running: running, tone: isWork ? "work" : "break", readout: formatClock(remaining),
            caption: isWork ? "Focus" : "Break", urgent: isWork && remaining <= 10 && remaining > 0, remainingSeconds: remaining, elapsedMs: 0
        )
    }

    static func stopwatch(_ pocket: JSONObject, nowMs: Double) -> TimekeeperClock {
        let startedAt = pocket.finite("startedAt")
        let running = startedAt != nil
        let elapsed = (pocket.finite("elapsedMs") ?? 0) + (running ? nowMs - startedAt! : 0)
        return TimekeeperClock(
            fraction: RestText.fraction(elapsed.truncatingRemainder(dividingBy: 60000) / 60000), running: running, tone: "neutral", readout: formatStopwatch(elapsed),
            caption: running ? "Running" : elapsed > 0 ? "Paused" : "Ready", urgent: false, remainingSeconds: 0, elapsedMs: elapsed
        )
    }

    /// `widgetClock`: the reading for the clock in play, nil for the modes
    /// without one (deadline, world clock, chess clock).
    public static func reading(_ data: JSONObject, nowMs: Double) -> TimekeeperClock? {
        switch TimekeeperWidget.skin(data) {
        case "countdown", "hourglass": return timer(data.object("countdown") ?? JSONObject(), nowMs: nowMs)
        case "pomodoro": return pomodoro(data.object("pomodoro") ?? JSONObject(), nowMs: nowMs)
        case "stopwatch", "lap_timer": return stopwatch(data.object("stopwatch") ?? JSONObject(), nowMs: nowMs)
        case let mode where mode == "intervals" || mode == "tabata" || mode == "multi_stage_timer":
            let fallback: Double = mode == "tabata" ? 20 : mode == "multi_stage_timer" ? 60 : 300
            return timer(data.skinState(mode), nowMs: nowMs, fallback: fallback)
        default: return nil
        }
    }

    /// `widgetClockRunning`: answerable without a `now`.
    public static func isRunning(_ data: JSONObject) -> Bool {
        reading(data, nowMs: 0)?.running ?? false
    }

    /// The fixed instants a running clock is anchored to, so a reader outside
    /// the app (the home-screen widget) can tick it without the board: the
    /// moment a countdown reaches zero, or the moment a stopwatch would have
    /// read zero. Both nil while the clock is still.
    public static func liveAnchor(_ data: JSONObject) -> (countsDownToMs: Double?, countsUpFromMs: Double?) {
        switch TimekeeperWidget.skin(data) {
        case "countdown", "hourglass": return (data.object("countdown")?.finite("endAt"), nil)
        case "pomodoro": return (data.object("pomodoro")?.finite("endAt"), nil)
        case "stopwatch", "lap_timer":
            let pocket = data.object("stopwatch") ?? JSONObject()
            guard let startedAt = pocket.finite("startedAt") else { return (nil, nil) }
            return (nil, startedAt - (pocket.finite("elapsedMs") ?? 0))
        case "intervals", "tabata", "multi_stage_timer":
            return (data.skinState(TimekeeperWidget.skin(data)).finite("endAt"), nil)
        default: return (nil, nil)
        }
    }
}
