import XCTest
import GrovepadCore
@testable import GrovepadCollaboration

/// The session and runtime against an in-memory server: what two people on
/// one shared canvas see, what happens offline, and what a read-only role
/// can and cannot do.
@MainActor
final class CollaborationSessionTests: XCTestCase {
    private var directories: [URL] = []

    override func tearDown() {
        for directory in directories { try? FileManager.default.removeItem(at: directory) }
        directories = []
        super.tearDown()
    }

    private func queue() -> OfflineUpdateQueue {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("collab-\(UUID().uuidString)")
        directories.append(directory)
        return OfflineUpdateQueue(root: directory)
    }

    private func client(_ server: FakeServer, user: String, board: Board) -> (FakeHost, CollaborationRuntime) {
        let host = FakeHost(board: board)
        let repository = FakeRepository(server: server, userId: user)
        let runtime = CollaborationRuntime(host: host, queue: queue(), configured: true) { repository }
        runtime.start(identity: CollaborationIdentity(userId: user, name: user.capitalized, color: "#123456"))
        return (host, runtime)
    }

    private func text(_ host: FakeHost, _ id: String) -> String? {
        host.board.widgets[id]?.data.string("text")
    }

    func testTwoEditorsSeeEachOthersWork() async throws {
        let server = FakeServer()
        let (alice, aliceRuntime) = client(server, user: "alice", board: Boards.board(widgets: [Boards.widget("note", text: "Hello")]))
        await eventually("alice connected") { aliceRuntime.state.status == .connected }
        XCTAssertEqual(aliceRuntime.state.role, .owner)
        XCTAssertGreaterThan(server.persisted("canvas"), 0, "the first editor seeds the server")

        server.roles["canvas|bob"] = .editor
        let (bob, bobRuntime) = client(server, user: "bob", board: Boards.board())
        await eventually("bob connected") { bobRuntime.state.status == .connected }
        XCTAssertEqual(text(bob, "note"), "Hello", "cold start replays the durable log")
        await eventually("both see two people") { aliceRuntime.state.participants.count == 2 && bobRuntime.state.participants.count == 2 }

        bob.edit { board in
            var note = board.widgets["note"]!
            var data = note.data
            data["text"] = .string("Hello, world")
            note.data = data
            board.widgets["note"] = note
        }
        await eventually("alice receives bob's text") { self.text(alice, "note") == "Hello, world" }

        alice.edit { board in board.widgets["second"] = Boards.widget("second", text: "From Alice", x: 400) }
        await eventually("bob receives alice's widget") { bob.board.widgets["second"] != nil }
        XCTAssertEqual(text(bob, "second"), "From Alice")
        await eventually("queues drain") { aliceRuntime.state.pendingUpdates == 0 && bobRuntime.state.pendingUpdates == 0 }

        aliceRuntime.dispose()
        await eventually("alice leaves bob's list") { bobRuntime.state.participants.count == 1 }
        bobRuntime.dispose()
    }

    func testEditsMadeOfflineAreQueuedThenDelivered() async throws {
        let server = FakeServer()
        let (host, runtime) = client(server, user: "alice", board: Boards.board(widgets: [Boards.widget("note", text: "a")]))
        await eventually("connected") { runtime.state.status == .connected }
        await eventually("seed flushed") { runtime.state.pendingUpdates == 0 }
        let before = server.persisted("canvas")

        host.isOnline = false
        runtime.networkChanged(online: false)
        XCTAssertEqual(runtime.state.status, .offline)
        host.edit { board in board.widgets["offline"] = Boards.widget("offline", text: "written on a plane") }
        await eventually("queued") { runtime.state.pendingUpdates == 1 }
        XCTAssertEqual(server.persisted("canvas"), before, "nothing reaches the server while offline")

        host.isOnline = true
        runtime.networkChanged(online: true)
        await eventually("flushed") { runtime.state.pendingUpdates == 0 && server.persisted("canvas") == before + 1 }

        // A newcomer rebuilds the offline widget from the durable log alone.
        server.roles["canvas|bob"] = .viewer
        let (bob, bobRuntime) = client(server, user: "bob", board: Boards.board())
        await eventually("bob sees it") { self.text(bob, "offline") == "written on a plane" }
        bobRuntime.dispose()
        runtime.dispose()
    }

    func testViewerCannotChangeTheCanvas() async throws {
        let server = FakeServer()
        let (_, owner) = client(server, user: "alice", board: Boards.board(widgets: [Boards.widget("note", text: "Owner's")]))
        await eventually("owner seeded") { owner.state.status == .connected && owner.state.pendingUpdates == 0 }

        server.roles["canvas|vera"] = .viewer
        let (viewer, runtime) = client(server, user: "vera", board: Boards.board())
        await eventually("viewer connected") { runtime.state.status == .connected }
        XCTAssertEqual(runtime.state.role, .viewer)
        XCTAssertTrue(viewer.editingLocked, "read-only roles lock the board")
        XCTAssertFalse(runtime.state.canEdit)
        XCTAssertFalse(viewer.history?.canUndo ?? true)
        let persisted = server.persisted("canvas")
        viewer.edit { board in board.widgets.removeValue(forKey: "note") }
        XCTAssertEqual(viewer.board.widgets["note"]?.data.string("text"), "Owner's")
        try? await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(server.persisted("canvas"), persisted)

        runtime.dispose()
        XCTAssertFalse(viewer.editingLocked, "leaving the canvas unlocks the board")
        owner.dispose()
    }

    func testUndoRevertsOnlyYourOwnChange() async throws {
        let server = FakeServer()
        let (alice, aliceRuntime) = client(server, user: "alice", board: Boards.board(widgets: [Boards.widget("note", text: "base")]))
        await eventually("alice connected") { aliceRuntime.state.status == .connected }
        server.roles["canvas|bob"] = .editor
        let (bob, bobRuntime) = client(server, user: "bob", board: Boards.board())
        await eventually("bob synced") { self.text(bob, "note") == "base" }

        bob.edit { board in board.widgets["bobs"] = Boards.widget("bobs", text: "Bob's card") }
        await eventually("alice sees bob's card") { alice.board.widgets["bobs"] != nil }
        try? await Task.sleep(nanoseconds: 400_000_000) // past the 350 ms capture window
        alice.edit { board in board.widgets["alices"] = Boards.widget("alices", text: "Alice's card") }
        await eventually("alice can undo") { alice.history?.canUndo == true }

        alice.history?.undo()
        XCTAssertNil(alice.board.widgets["alices"], "undo removes Alice's own card")
        XCTAssertNotNil(alice.board.widgets["bobs"], "and never Bob's")
        await eventually("bob sees the undo") { bob.board.widgets["alices"] == nil && bob.board.widgets["bobs"] != nil }
        XCTAssertTrue(alice.history?.canRedo ?? false)
        alice.history?.redo()
        XCTAssertNotNil(alice.board.widgets["alices"])

        aliceRuntime.dispose()
        bobRuntime.dispose()
    }

    func testPrivateCanvasesNeverConnect() async throws {
        let server = FakeServer()
        let (host, runtime) = client(server, user: "alice", board: Boards.board(shared: false))
        try? await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(runtime.state.status, .disabled)
        XCTAssertTrue(server.owners.isEmpty, "a private canvas is never registered")

        try await runtime.setShared(true)
        XCTAssertTrue(host.board.canvases["canvas"]?.shared ?? false)
        await eventually("connected after sharing") { runtime.state.status == .connected }
        XCTAssertEqual(server.owners["canvas"], "alice")

        host.navigate(to: "private")
        await eventually("session stops on a private canvas") { runtime.state.status == .disabled }
        host.navigate(to: "canvas")
        await eventually("and resumes on the shared one") { runtime.state.status == .connected }

        try await runtime.setShared(false)
        XCTAssertEqual(server.deleted, ["canvas"], "turning sharing off revokes access on the server")
        XCTAssertFalse(host.board.canvases["canvas"]?.shared ?? true)
        XCTAssertEqual(runtime.state.status, .disabled)
        runtime.dispose()
    }

    func testGuestsNeverStartTransport() async throws {
        let server = FakeServer()
        let host = FakeHost(board: Boards.board())
        let runtime = CollaborationRuntime(host: host, queue: queue(), configured: true) { FakeRepository(server: server, userId: "x") }
        runtime.start(identity: nil)
        try? await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(runtime.state.status, .disabled)
        XCTAssertTrue(server.channels.isEmpty)
        do {
            try await runtime.setShared(true)
            XCTFail("a guest cannot share")
        } catch {}
    }

    func testInviteLinksWaitForConsent() async throws {
        let server = FakeServer()
        let (_, owner) = client(server, user: "alice", board: Boards.board(widgets: [Boards.widget("note", text: "Shared")]))
        await eventually("owner seeded") { owner.state.status == .connected && owner.state.pendingUpdates == 0 }
        server.roles["canvas|bob"] = .commenter

        // Bob has a private canvas with the same id: the link is refused.
        let (bobPrivate, refusing) = client(server, user: "bob", board: Boards.board(shared: false))
        do {
            try await refusing.openLink(canvasId: "canvas")
            XCTFail("a link must not overwrite a private canvas")
        } catch {}
        XCTAssertNil(refusing.state.pendingInvite)
        XCTAssertFalse(bobPrivate.board.canvases["canvas"]?.shared ?? true)
        refusing.dispose()

        // Without that canvas, the link waits as an invite until accepted.
        var board = Boards.board(shared: false)
        board.canvases.removeValue(forKey: "canvas")
        board.workspaces["workspace"] = Workspace(id: "workspace", name: "Workspace", rootCanvasId: "private", createdAt: 1)
        board.activeCanvasId = "private"
        let (bob, runtime) = client(server, user: "bob", board: board)
        try await runtime.openLink(canvasId: "canvas")
        XCTAssertEqual(runtime.state.pendingInvite, PendingCanvasInvite(canvasId: "canvas", name: "Origin"))
        XCTAssertNil(bob.board.canvases["canvas"], "nothing changes before consent")
        try runtime.acceptPendingInvite()
        await eventually("joined") { runtime.state.status == .connected && self.text(bob, "note") == "Shared" }
        XCTAssertEqual(runtime.state.role, .commenter)
        try await runtime.postComment("Looks good")
        XCTAssertEqual(runtime.state.comments.map(\.body), ["Looks good"])
        runtime.dispose()
        owner.dispose()
    }

    func testFollowTracksAndReleasesTheCamera() async throws {
        let server = FakeServer()
        let (alice, aliceRuntime) = client(server, user: "alice", board: Boards.board())
        await eventually("alice connected") { aliceRuntime.state.status == .connected }
        server.roles["canvas|bob"] = .viewer
        let (bob, bobRuntime) = client(server, user: "bob", board: Boards.board())
        await eventually("bob sees alice") { bobRuntime.state.others.count == 1 }

        let aliceId = try XCTUnwrap(bobRuntime.state.others.first?.clientId)
        bobRuntime.follow(aliceId)
        alice.camera = CollaborationCamera(pan: Vector2D(x: 120, y: -40), zoom: 2)
        aliceRuntime.session?.updatePresence { $0["camera"] = PresenceRules.cameraJSON(alice.camera!) }
        await eventually("bob's camera follows") { bob.camera == CollaborationCamera(pan: Vector2D(x: 120, y: -40), zoom: 2) }

        alice.movePointer(Vector2D(x: 5, y: 6))
        await eventually("bob sees alice's cursor") { bobRuntime.state.others.first?.cursor == Vector2D(x: 5, y: 6) }

        aliceRuntime.dispose()
        await eventually("follow ends when alice leaves") { bobRuntime.state.followingClientId == nil }
        bobRuntime.dispose()
    }
}
