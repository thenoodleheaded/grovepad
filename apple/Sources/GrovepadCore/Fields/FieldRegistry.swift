import Foundation

// ---------------------------------------------------------------------------
// The bindable field registry (`widgets/fields.ts`): which values inside each
// module type a wire can read or write, and the one-shot commands a trigger
// can fire. Family tables merge in the web's spread order; a type absent
// from every table has no ports.
// ---------------------------------------------------------------------------

public enum FieldRegistry {
    /// In-scope types whose tables are deliberately empty because they wait
    /// on another port. Empty since the skin-model tables (`date_picker`,
    /// `formula`, `calculator`, `poll`) landed; kept so `fieldsFor` can
    /// answer `[]` on purpose again if a type is ever parked.
    public static let deferredTypes: [String] = []

    static let fields: [String: [FieldDescriptor]] = {
        var merged: [String: [FieldDescriptor]] = [:]
        for table in [
            CoreWidgetFields.tables, DataMediaFields.tables, StudyFields.tables, InputLogicFields.tables,
            DateFields.tables, FormulaFields.tables, CalculatorFields.tables, PollFields.tables,
        ] {
            merged.merge(table) { _, new in new }
        }
        // `canvas_node` is a structural exemption (widget constitution III):
        // registered with no fields so it is a citizen with an empty rail.
        merged["canvas_node"] = []
        for type in deferredTypes { merged[type] = [] }
        return merged
    }()

    static let commands: [String: [CommandDescriptor]] = CoreCommands.tables.merging(PollFields.commands) { _, new in new }
}

/// Every readable field of a type, in port-slot order.
public func fieldsFor(_ type: String) -> [FieldDescriptor] {
    FieldRegistry.fields[type] ?? []
}

public func fieldDescriptor(_ type: String, _ key: String) -> FieldDescriptor? {
    FieldRegistry.fields[type]?.first { $0.key == key }
}

/// The trigger commands a type accepts, in port-slot order after its settable fields.
public func commandsFor(_ type: String) -> [CommandDescriptor] {
    FieldRegistry.commands[type] ?? []
}
