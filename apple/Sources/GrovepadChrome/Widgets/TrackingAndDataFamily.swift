import GrovepadCore

/// Renderers for the tracking, data and input family (phase 8): habit,
/// timekeeper, calendar, rating, calculator, bar_chart, table, metrics,
/// mood_tracker, links, poll, text_input, date_picker, formula, status.
/// Owned by that family's porting task.
public enum TrackingAndDataFamily {
    /// The family's types, in registry order.
    public static let types: [String] = [
        "habit", "timekeeper", "calendar", "rating", "calculator", "bar_chart", "table", "metrics",
        "mood_tracker", "links", "poll", "text_input", "date_picker", "formula", "status",
    ]

    public static var renderers: [AnyWidgetRenderer] {
        [
            AnyWidgetRenderer(HabitWidget()),
            AnyWidgetRenderer(TimekeeperWidget()),
            AnyWidgetRenderer(CalendarWidget()),
            AnyWidgetRenderer(RatingWidget()),
            AnyWidgetRenderer(CalculatorWidget()),
            AnyWidgetRenderer(BarChartWidget()),
            AnyWidgetRenderer(TableWidget()),
            AnyWidgetRenderer(MetricsWidget()),
            AnyWidgetRenderer(MoodTrackerWidget()),
            AnyWidgetRenderer(LinksWidget()),
            AnyWidgetRenderer(PollWidget()),
            AnyWidgetRenderer(TextInputWidget()),
            AnyWidgetRenderer(DatePickerWidget()),
            AnyWidgetRenderer(FormulaWidget()),
            AnyWidgetRenderer(StatusWidget()),
        ]
    }
}
