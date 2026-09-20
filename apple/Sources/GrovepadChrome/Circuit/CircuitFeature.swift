import Foundation

// ---------------------------------------------------------------------------
// The one switch for the circuit system (wires, ports, Circuit Mode, the
// driver). Frozen by the owner's decision (18 Sep 2026): the native app ships
// without it for now. Frozen means hidden and inert, never destructive —
// wires already on a board stay in its bytes untouched and come back the
// moment this is switched on. Every entry point checks it:
// `BoardDocument.setCircuitMode`, the toolbar ⚡, View ▸ Circuit Mode, the W
// key, the port rails on both hosts, the wire layer, and the driver start in
// `AppCoordinator`. Tests that exercise circuits switch it on in `setUp`.
// ---------------------------------------------------------------------------

public enum CircuitFeature {
    nonisolated(unsafe) public static var isEnabled = false
}
