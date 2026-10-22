import { DI, observable } from 'aurelia';
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
import { AuthKitSessionStore } from './authkit-session-store';

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

export type AuthSessionListener = (session: AuthSession | null) => void;

/**
 * Browser client for a server-driven federation (Cl@ve), Aurelia v2 flavour.
 *
 * `session` is an `@observable` property, so templates and `IObserverLocator`
 * consumers update without a signal library. The client itself never parses
 * SAML, never exchanges a token and never navigates.
 */
export interface IAuthKitClient extends ServerDrivenAuthProvider {
  readonly session: AuthSession | null;
  readonly user: AuthUser | null;
  readonly loa: AuthAssuranceLevel | null;
  readonly isAuthenticated: boolean;

  /** Subscribes to session replacements outside the Aurelia observation system. */
  onSessionChanged(listener: AuthSessionListener): () => void;

  /** Host-driven bootstrap: pushes the server-side session into the browser view. */
  setSession(session: AuthSession | null): void;
}

export const IAuthKitClient = DI.createInterface<IAuthKitClient>('IAuthKitClient');

export class AuthKitClient implements IAuthKitClient {
  static inject = [AuthKitConfig, AuthKitSessionStore];

  @observable
  session: AuthSession | null = null;

  private readonly listeners = new Set<AuthSessionListener>();
  private activeRef: string | null = null;

  constructor(
    private readonly config: AuthKitConfig,
    private readonly store: AuthKitSessionStore,
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

  get user(): AuthUser | null {
    return this.session?.user ?? null;
  }

  get loa(): AuthAssuranceLevel | null {
    return this.session?.user.identity?.level ?? null;
  }

  get isAuthenticated(): boolean {
    return this.session !== null;
  }

  get currentSession(): AuthSession | null {
    return this.session;
  }

  onStateChange(listener: (change: AuthStateChange) => void): () => void {
    return this.onSessionChanged((session) => {
      listener({ state: session === null ? 'idle' : 'authenticated', session });
    });
  }

  /** Called by Aurelia's observation system after `session` changes. */
  sessionChanged(_newValue: AuthSession | null, _oldValue: AuthSession | null): void {
    for (const listener of this.listeners) {
      listener(this.session);
    }
  }

  onSessionChanged(listener: AuthSessionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setSession(session: AuthSession | null): void {
    if (session === null) {
      // Sign out only the provider this client owns (R-22), never another session.
      if (this.activeRef !== null) {
        this.store.clear(this.activeRef);
        this.activeRef = null;
      }
      this.session = null;
      return;
    }

    const ref = session.provider?.ref ?? null;
    this.activeRef = ref;
    if (ref !== null) {
      this.store.put(ref, session);
    }
    this.session = session;
  }

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
      return url.toString();
    });
  }

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

    if (this.session === null) {
      return fail(
        authError(
          'identity_not_verified',
          'The host has no session after the federation redirect.',
        ),
      );
    }

    return ok(this.session);
  }

  signOut(): Promise<void> {
    this.setSession(null);
    return Promise.resolve();
  }

  /** Retained for parity with the v1 surface; there is nothing to refresh locally. */
  refreshSession(): Promise<AuthResult> {
    return Promise.resolve(
      this.session === null
        ? fail(authError('session_expired', 'No session is available.'))
        : ok(this.session),
    );
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

/** Unused by the server-driven flow, but the surface stays symmetric with v1. */
export const UNSUPPORTED_PASSWORD_FLOW = NOT_SUPPORTED;
