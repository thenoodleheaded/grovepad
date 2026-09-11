// ---------------------------------------------------------------------------
// When the login page is the right answer, and when it is a dead end.
//
// Signing in is a network operation. Showing the login wall to somebody who
// was signed in yesterday, on a device with no connection, offers them a form
// that cannot possibly succeed — and the only way past it is "continue as
// guest", which is not what they are. They get their board instead, and the
// session restores itself the moment the network is back.
//
// Only an explicit sign-out forgets the account (useAuthStore.signOut), so
// this can never hold the door open for somebody who deliberately left.
// ---------------------------------------------------------------------------

export interface LoginGateInput {
  /** A live cloud session, if the auth server has been reached. */
  hasSession: boolean
  /** The user chose local-only mode. */
  isGuest: boolean
  /** Somebody was signed in here before and never signed out. */
  hasRememberedAccount: boolean
  networkOnline: boolean
  /** A shared-canvas link needs a real account, so it always asks. */
  joiningSharedCanvas: boolean
}

export function shouldShowLoginPage(input: LoginGateInput): boolean {
  if (input.hasSession) return false
  if (input.joiningSharedCanvas) return true
  if (input.isGuest) return false
  return input.networkOnline || !input.hasRememberedAccount
}
