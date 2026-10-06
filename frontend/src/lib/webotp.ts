/**
 * WebOTP (ج۱): Android Chrome reads the login SMS whose last line is `@<host> #<code>` and offers
 * the code to the page after one tap. Elsewhere (iOS, desktop, Firefox) this is a silent no-op and
 * the input's `autocomplete="one-time-code"` keyboard suggestion does the job.
 */
import { cleanCode } from "./otp";

interface OtpCredentialLike {
  code?: string;
}

type CredentialsGet = (options: unknown) => Promise<unknown>;

/** True when the browser exposes the WebOTP API. */
export function webOtpSupported(win: unknown = typeof window === "undefined" ? undefined : window): boolean {
  return typeof win === "object" && win !== null && "OTPCredential" in win;
}

/**
 * Wait for the SMS code. Resolves to the cleaned code, or `null` when unsupported, aborted,
 * denied, timed out or the SMS carried something unusable. Never throws.
 */
export async function receiveSmsCode(
  signal: AbortSignal,
  length: number,
  deps: { supported?: boolean; get?: CredentialsGet } = {},
): Promise<string | null> {
  const supported = deps.supported ?? webOtpSupported();
  const get: CredentialsGet | undefined =
    deps.get ??
    (typeof navigator !== "undefined" && navigator.credentials
      ? (o) => navigator.credentials.get(o as CredentialRequestOptions)
      : undefined);
  if (!supported || !get || signal.aborted) return null;
  try {
    const cred = (await get({ otp: { transport: ["sms"] }, signal })) as OtpCredentialLike | null;
    const code = cleanCode(cred?.code ?? "", length);
    return code.length === length ? code : null;
  } catch {
    return null; // AbortError, NotAllowedError, InvalidStateError …
  }
}
