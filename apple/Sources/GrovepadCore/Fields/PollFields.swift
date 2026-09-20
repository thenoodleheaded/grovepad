import Foundation

// ---------------------------------------------------------------------------
// Poll fields and commands (`widgets/fields/coreWidgetFields.ts` and
// `coreCommands.ts`, `poll`). Field order IS port-slot order.
// ---------------------------------------------------------------------------

enum PollFields {
    static let tables: [String: [FieldDescriptor]] = [
        "poll": [
            FieldDescriptor(
                key: "votes", label: "Total votes", valueType: .number, unit: .count,
                get: { data in .number(PollSkinModel.totalVotes(PollSkinModel.options(data["options"]))) }
            ),
            FieldDescriptor(
                key: "leader", label: "Leading option", valueType: .text,
                get: { data in
                    let options = PollSkinModel.options(data["options"])
                    if PollSkinModel.isTied(options) { return .text("Tied") }
                    return .text(PollSkinModel.leadingOption(options)?.label ?? "")
                }
            ),
            FieldDescriptor(
                key: "leader_share", label: "Leading share", valueType: .number, unit: .percent,
                get: { data in
                    let options = PollSkinModel.options(data["options"])
                    return .number(PollSkinModel.share(PollSkinModel.leadingOption(options)?.votes ?? 0, PollSkinModel.totalVotes(options)))
                }
            ),
        ],
    ]

    static let commands: [String: [CommandDescriptor]] = [
        "poll": [
            // Ballots, duel records, and room phase are the same result told
            // another way, so clearing votes has to clear them too.
            CommandDescriptor(key: "reset", label: "Clear votes") { data, _, _ in PollSkinModel.resetVotes(data) },
        ],
    ]
}
