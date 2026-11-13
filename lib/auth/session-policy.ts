/** Cookie lifetime is renewed while the account remains signed in. */
export const SESSION_COOKIE_SECONDS = 400 * 24 * 60 * 60;
export const PERSISTENT_SESSION_EXPIRES_AT = Date.UTC(9999, 11, 31);

export function transientAuthError(error: { status?: number; name?: string } | null | undefined) {
  return Boolean(error && ((error.status ?? 0) >= 500 || error.status === 429 || error.name === "AuthRetryableFetchError"));
}
