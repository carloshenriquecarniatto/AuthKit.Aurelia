import {
  authError,
  fail,
  ok,
  type AuthAssuranceLevel,
  type AuthCapabilities,
  type AuthErrorCode,
  type AuthFederationProvider,
  type AuthResult,
  type AuthSession,
  type AuthUser,
} from './contract/auth.models';
import type { AuthStateChange, ServerDrivenAuthProvider } from './contract/auth.provider';
import { resolveProvider } from './contract/providerRef';
import { AuthKitConfig } from './authkit-config';
import { AuthKitSession } from './authkit-session';

const NOT_SUPPORTED = 'This provider only supports server-driven federation.';

/** Codes a host may place in `?error=` / `?error_reason=` (spec-clave §5.8). */
const CALLBACK_ERROR_CODES: readonly AuthErrorCode[] = [
  'federation_cancelled',
  'federation_failed',
  'loa_not_met',
  'certificate_invalid',
  'identity_not_verified',
  'tenant_mismatch',
];

const CALLBACK_MESSAGES: Readonly<Partial<Record<AuthErrorCode, string>>> = {
  federation_cancelled: 'The sign-in was cancelled.',
  federation_failed: 'The sign-in could not be completed.',
  loa_not_met: 'The granted assurance level is below the requested level.',
  certificate_invalid: 'The certificate could not be validated.',
  identity_not_verified: 'The identity could not be verified.',
  tenant_mismatch: 'The identity does not belong to this tenant.',
};

/**
 * Browser client for a server-driven federation (Cl@ve).
 *
 * It builds the host's own login URL and reads the redirect outcome. It has no
 * SAML parser, no signing capability and no token exchange: after the ACS the
 * host already owns a session, and this client only mirrors it.
 */
export class AuthKitClient implements ServerDrivenAuthProvider {
  static inject = [AuthKitConfig, AuthKitSession];

  constructor(
    private readonly config: AuthKitConfig,
    private readonly authSession: AuthKitSession,
  ) {}

  get capabilities(): AuthCapabilities {
    return {
      password: false,
      signUp: false,
      magicLink: false,
      emailOtp: false,
      phoneOtp: false,
      passwordRecovery: false,
      mfa: false,
      socialProviders: [],
      federation: this.config.providers,
    };
  }

  get providers(): readonly AuthFederationProvider[] {
    return this.config.providers;
  }

  get currentSession(): AuthSession | null {
    return this.authSession.session;
  }

  get session(): AuthSession | null {
    return this.authSession.session;
  }

  get user(): AuthUser | null {
    return this.authSession.user;
  }

  get loa(): AuthAssuranceLevel | null {
    return this.authSession.loa;
  }

  get isAuthenticated(): boolean {
    return this.authSession.isAuthenticated;
  }

  onStateChange(listener: (change: AuthStateChange) => void): () => void {
    return this.authSession.onStateChange(listener);
  }

  /**
   * Builds the host login URL for one provider, level and optional method.
   * Never navigates: the caller decides what to do with the string.
   */
  beginFederation(
    providerRef: string,
    level: AuthAssuranceLevel,
    method: string | null = null,
    returnUrl: string | null = null,
  ): Promise<string> {
    return Promise.resolve().then(() => {
      const provider = resolveProvider(this.config.registrations, {
        providerRef,
        audience: this.config.audience,
      });

      if (!provider.levels.includes(level)) {
        throw new Error(
          `AuthKit: provider "${providerRef}" does not offer assurance level "${level}".`,
        );
      }

      if (method !== null && !provider.methods.some((entry) => entry.id === method)) {
        throw new Error(`AuthKit: provider "${providerRef}" does not offer method "${method}".`);
      }

      const url = new URL(this.config.loginPath, this.config.baseUrl);
      url.searchParams.set('loa', level);
      url.searchParams.set('provider', providerRef);
      if (method !== null) {
        url.searchParams.set('method', method);
      }
      if (returnUrl !== null) {
        url.searchParams.set('returnUrl', returnUrl);
      }

      this.authSession.setState('redirecting');
      return url.toString();
    });
  }

  /**
   * Reads `?error=` / `?error_reason=` from the host's redirect and nothing else.
   * Success is inferred from the host session that already exists.
   */
  completeFederation(callbackUrl: string): AuthResult {
    const url = new URL(callbackUrl, this.config.baseUrl);
    const error = url.searchParams.get('error');
    const reason = url.searchParams.get('error_reason');

    if (error !== null || reason !== null) {
      const code = mapCallbackError(reason) ?? mapCallbackError(error) ?? 'federation_failed';
      return fail(
        authError(
          code,
          CALLBACK_MESSAGES[code] ??
            CALLBACK_MESSAGES.federation_failed ??
            'The sign-in could not be completed.',
        ),
      );
    }

    const session = this.authSession.session;
    if (session === null) {
      return fail(
        authError(
          'identity_not_verified',
          'The host has no session after the federation redirect.',
        ),
      );
    }

    return ok(session);
  }

  /** Host-driven bootstrap: pushes the server-side session into the browser view. */
  setSession(session: AuthSession | null): void {
    this.authSession.setSession(session);
  }

  refreshSession(): Promise<AuthResult> {
    const session = this.authSession.session;
    return Promise.resolve(
      session === null
        ? fail(authError('session_expired', 'No session is available.'))
        : ok(session),
    );
  }

  signOut(): Promise<void> {
    return this.authSession.signOut();
  }

  signInWithPassword(): Promise<AuthResult> {
    return Promise.resolve(fail(authError('provider_disabled', NOT_SUPPORTED)));
  }

  signUpWithPassword(): Promise<AuthResult> {
    return Promise.resolve(fail(authError('provider_disabled', NOT_SUPPORTED)));
  }

  sendMagicLink(): Promise<AuthResult> {
    return Promise.resolve(fail(authError('provider_disabled', NOT_SUPPORTED)));
  }

  sendPasswordReset(): Promise<AuthResult> {
    return Promise.resolve(fail(authError('provider_disabled', NOT_SUPPORTED)));
  }

  updatePassword(): Promise<AuthResult> {
    return Promise.resolve(fail(authError('provider_disabled', NOT_SUPPORTED)));
  }

  sendEmailOtp(): Promise<AuthResult> {
    return Promise.resolve(fail(authError('provider_disabled', NOT_SUPPORTED)));
  }

  verifyEmailOtp(): Promise<AuthResult> {
    return Promise.resolve(fail(authError('provider_disabled', NOT_SUPPORTED)));
  }

  sendPhoneOtp(): Promise<AuthResult> {
    return Promise.resolve(fail(authError('provider_disabled', NOT_SUPPORTED)));
  }

  verifyPhoneOtp(): Promise<AuthResult> {
    return Promise.resolve(fail(authError('provider_disabled', NOT_SUPPORTED)));
  }

  beginOAuth(): Promise<string> {
    return Promise.reject(new Error(NOT_SUPPORTED));
  }

  completeOAuth(): Promise<AuthResult> {
    return Promise.resolve(fail(authError('provider_disabled', NOT_SUPPORTED)));
  }
}

/** Maps a host error value to the contract taxonomy, or null when unknown. */
export function mapCallbackError(value: string | null): AuthErrorCode | null {
  if (value === null) {
    return null;
  }
  if (value === 'access_denied' || value === 'cancelled') {
    return 'federation_cancelled';
  }
  return CALLBACK_ERROR_CODES.includes(value as AuthErrorCode) ? (value as AuthErrorCode) : null;
}

/** Returns the callback URL with the outcome parameters removed. */
export function callbackUrlWithoutOutcome(callbackUrl: string, baseUrl: string): string {
  const url = new URL(callbackUrl, baseUrl);
  url.searchParams.delete('error');
  url.searchParams.delete('error_reason');
  return url.toString();
}
