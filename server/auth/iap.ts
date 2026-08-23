import { OAuth2Client } from 'google-auth-library';
import { UnauthorizedError } from '../http/errors';
import type { IdentityVerifier, VerifiedIdentity } from './identity';

// ---------------------------------------------------------------------------
// Verification of Identity-Aware Proxy's signed assertion.
//
// WHY THE SIGNED HEADER AND NOT THE PLAIN ONE
//   IAP sets two headers. X-Goog-Authenticated-User-Email is plain text and
//   trivially forged by anything that can reach the container directly -- and
//   "nothing can" is a network assumption, not a guarantee. This module reads
//   only X-Goog-IAP-JWT-Assertion, whose signature proves IAP itself produced
//   it, and which is bound to this specific service by its audience claim.
// ---------------------------------------------------------------------------

const JWT_HEADER = 'x-goog-iap-jwt-assertion';
const IAP_ISSUER = 'https://cloud.google.com/iap';

/**
 * How long IAP's public keys are reused before refetching.
 *
 * getIapPublicKeys() performs an HTTPS request every call. Doing that per
 * request would add a round trip to every single API call for keys that rotate
 * on the order of days.
 */
const KEY_CACHE_MS = 60 * 60 * 1000;

export interface IapVerifierOptions {
  /**
   * The `aud` claim this service must see. Copy it from the IAP settings for
   * the Cloud Run service -- it identifies THIS service, and checking it is what
   * stops an assertion minted for some other IAP-protected service from being
   * replayed here.
   */
  audience: string;
}

export function createIapVerifier({ audience }: IapVerifierOptions): IdentityVerifier {
  const client = new OAuth2Client();
  // getIapPublicKeysAsync (not the overloaded getIapPublicKeys) so the return
  // type is unambiguously the response object rather than the callback form.
  type PublicKeys = Awaited<ReturnType<OAuth2Client['getIapPublicKeysAsync']>>['pubkeys'];
  let cachedKeys: PublicKeys | null = null;
  let cachedAt = 0;

  async function publicKeys(): Promise<PublicKeys> {
    const now = Date.now();
    if (cachedKeys && now - cachedAt < KEY_CACHE_MS) return cachedKeys;
    const { pubkeys } = await client.getIapPublicKeysAsync();
    cachedKeys = pubkeys;
    cachedAt = now;
    return pubkeys;
  }

  return {
    async verify(headers) {
      const token = headers.get(JWT_HEADER);
      if (!token) {
        // Reaching the container without IAP's assertion means either the proxy
        // is misconfigured or something bypassed it. Both are "not signed in".
        throw new UnauthorizedError('IAP の認証情報がありません');
      }

      let payload;
      try {
        const ticket = await client.verifySignedJwtWithCertsAsync(
          token,
          await publicKeys(),
          audience,
          [IAP_ISSUER],
        );
        payload = ticket.getPayload();
      } catch (error) {
        // Includes an expired token, a wrong audience and a bad signature. The
        // distinction is useful in the log, never to the caller.
        throw new UnauthorizedError(
          `IAP アサーションの検証に失敗しました: ${(error as Error).message}`,
        );
      }

      if (!payload?.sub || !payload.email) {
        throw new UnauthorizedError('IAP アサーションに sub / email が含まれていません');
      }

      return { googleSub: payload.sub, email: payload.email } satisfies VerifiedIdentity;
    },
  };
}
