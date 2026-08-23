// ---------------------------------------------------------------------------
// Who is calling, established before any database work happens.
//
// The application never implements OAuth itself. Identity-Aware Proxy sits in
// front of Cloud Run, performs the Google sign-in, and refuses anyone who is not
// on the IAM allow list. By the time a request reaches this process, it has
// already been authenticated -- what remains is to verify that the request
// really came through IAP and to find out who it says the caller is.
// ---------------------------------------------------------------------------

/** The two claims worth keeping out of a verified assertion. */
export interface VerifiedIdentity {
  /**
   * Google's stable subject identifier (IAP formats it as
   * `accounts.google.com:<id>`). This is the identity key -- see the note on
   * users.google_sub in migration 001 for why it is not the email address.
   */
  googleSub: string;
  email: string;
}

export interface IdentityVerifier {
  /** Resolves the caller, or throws UnauthorizedError. */
  verify(headers: Headers): Promise<VerifiedIdentity>;
}
