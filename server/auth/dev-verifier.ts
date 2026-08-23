import { UnauthorizedError } from '../http/errors';
import type { IdentityVerifier } from './identity';

// ---------------------------------------------------------------------------
// A stand-in verifier for local development.
//
// IAP only exists in front of a deployed Cloud Run service, so without this
// there is no way to run the app on a laptop. It trusts a plain header, which is
// exactly what the real verifier refuses to do -- so it must never be reachable
// in a deployed environment.
//
// createDevVerifier() therefore refuses to be constructed when NODE_ENV is
// 'production'. The check lives here, at the point of construction, rather than
// in the code that chooses a verifier: a second caller could forget the check,
// but nobody can forget to call the constructor.
// ---------------------------------------------------------------------------

const EMAIL_HEADER = 'x-dev-user-email';

export function createDevVerifier(nodeEnv: string | undefined): IdentityVerifier {
  if (nodeEnv === 'production') {
    throw new Error(
      'AUTH_MODE=dev cannot be used in production: it accepts an unauthenticated header as proof of identity',
    );
  }

  return {
    async verify(headers) {
      const email = headers.get(EMAIL_HEADER);
      if (!email) {
        throw new UnauthorizedError(
          `development auth requires a ${EMAIL_HEADER} header`,
        );
      }
      // A synthetic subject, shaped like IAP's, so the same provisioning path
      // runs locally as in production.
      return { googleSub: `dev:${email}`, email };
    },
  };
}
