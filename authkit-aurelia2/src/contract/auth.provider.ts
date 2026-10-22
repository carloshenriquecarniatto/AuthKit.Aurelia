import type {
  AuthAssuranceLevel,
  AuthCapabilities,
  AuthFederationProvider,
  AuthResult,
  AuthSession,
  AuthState,
} from './auth.models';

/** Payload emitted whenever the session or auth state changes. */
export interface AuthStateChange {
  readonly state: AuthState;
  readonly session: AuthSession | null;
}

/**
 * The single abstraction every AuthKit component binds to.
 * Implementations never navigate, never render, and never log token material.
 */
export interface AuthProvider {
  readonly capabilities: AuthCapabilities;
  readonly currentSession: AuthSession | null;

  /** Subscribes to state changes. Returns an unsubscribe function. */
  onStateChange(listener: (change: AuthStateChange) => void): () => void;

  signInWithPassword(email: string, password: string): Promise<AuthResult>;
  signUpWithPassword(
    email: string,
    password: string,
    metadata?: Readonly<Record<string, string>>,
  ): Promise<AuthResult>;
  sendMagicLink(email: string, redirectTo?: string): Promise<AuthResult>;
  sendPasswordReset(email: string, redirectTo?: string): Promise<AuthResult>;
  updatePassword(newPassword: string): Promise<AuthResult>;
  sendEmailOtp(email: string): Promise<AuthResult>;
  verifyEmailOtp(email: string, token: string): Promise<AuthResult>;
  sendPhoneOtp(phone: string): Promise<AuthResult>;
  verifyPhoneOtp(phone: string, token: string): Promise<AuthResult>;
  beginOAuth(provider: string, redirectTo?: string): Promise<string>;
  completeOAuth(callbackUrl: string): Promise<AuthResult>;
  refreshSession(): Promise<AuthResult>;
  signOut(): Promise<void>;
}

/** Persists a session between reloads. */
export interface AuthSessionStore {
  load(): Promise<AuthSession | null>;
  save(session: AuthSession): Promise<void>;
  clear(): Promise<void>;
}

/** Optional capability: a provider that must restore a persisted session. */
export interface InitializableAuthProvider extends AuthProvider {
  initialize(): Promise<AuthResult>;
}

/**
 * The payload of a server-driven federation begin (spec-clave §6).
 * The server owns the SAML round trip; the browser only needs the entry URL.
 */
export interface AuthFederationRequest {
  /** Canonical provider reference, `audience/providerId`. */
  readonly providerRef: string;
  readonly level: AuthAssuranceLevel;
  readonly method: string | null;
  readonly returnUrl: string | null;
}

/**
 * Optional capability for server-driven federations such as Cl@ve.
 *
 * Implementations build a URL on the host's own server and read the outcome the
 * host put in the redirect. They never parse SAML, never exchange a token and
 * never navigate; the host decides when to move the browser.
 */
export interface ServerDrivenAuthProvider extends AuthProvider {
  /** The descriptors the UI renders. Ordering, labels and levels come from data. */
  readonly providers: readonly AuthFederationProvider[];

  /** Builds the host's own login URL. The host navigates; AuthKit never does. */
  beginFederation(
    providerRef: string,
    level: AuthAssuranceLevel,
    method?: string | null,
    returnUrl?: string | null,
  ): Promise<string>;

  /** Reads the outcome the host put in the redirect. No network call, no token exchange. */
  completeFederation(callbackUrl: string): AuthResult;
}
