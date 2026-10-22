import type { AuthAssuranceLevel, AuthSession, AuthState, AuthUser } from './contract/auth.models';
import type { AuthStateChange } from './contract/auth.provider';

export type AuthSessionListener = (session: AuthSession | null) => void;

export interface AuthSessionChannel {
  /** Subscribes to session replacements. Returns an unsubscribe function. */
  subscribe(listener: AuthSessionListener): () => void;
  /** Number of active listeners; used by tests and by hosts that guard leaks. */
  readonly size: number;
}

class SessionChannel implements AuthSessionChannel {
  constructor(private readonly listeners: Set<AuthSessionListener>) {}

  subscribe(listener: AuthSessionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get size(): number {
    return this.listeners.size;
  }
}

/**
 * The v1 session surface: plain properties plus a subscription.
 *
 * Aurelia v1 has no signals and no composition API, so bindings read
 * `session.user.displayName`, `session.loa` and `session.isAuthenticated`
 * directly, and re-render when `sessionChanged` notifies.
 *
 * The service never fetches, never parses SAML and never stores anything: the
 * host's server owns the session (spec-clave §4.1).
 */
export class AuthKitSession {
  private current: AuthSession | null = null;
  private state: AuthState = 'idle';
  private readonly listeners = new Set<AuthSessionListener>();

  /** The active session, or null when signed out. */
  get session(): AuthSession | null {
    return this.current;
  }

  get user(): AuthUser | null {
    return this.current?.user ?? null;
  }

  get loa(): AuthAssuranceLevel | null {
    return this.current?.user.identity?.level ?? null;
  }

  get isAuthenticated(): boolean {
    return this.current !== null;
  }

  get authState(): AuthState {
    return this.state;
  }

  /** Audience of the session's provider, used by the authorize step. */
  get audience(): string | null {
    return this.current?.provider?.audience ?? null;
  }

  /** Canonical provider ref of the session, `audience/providerId`. */
  get providerRef(): string | null {
    return this.current?.provider?.ref ?? null;
  }

  /**
   * Notification channel for v1 bindings and for plain subscribers.
   * `sessionChanged.subscribe(...)` mirrors what a v1 application already does
   * with `BindingEngine` or an event aggregator.
   */
  readonly sessionChanged: AuthSessionChannel = new SessionChannel(this.listeners);

  /** Replaces the session. Called by `AuthKitClient`; never by a template. */
  setSession(session: AuthSession | null, state: AuthState = 'authenticated'): void {
    this.current = session;
    this.state = session === null ? 'idle' : state;
    this.emit();
  }

  /** Plain sign-out: clears the local view. The host owns the server session. */
  signOut(): Promise<void> {
    this.setSession(null, 'idle');
    return Promise.resolve();
  }

  /** Removes every listener. Useful when a host tears down a child container. */
  dispose(): void {
    this.listeners.clear();
  }

  /** Emits a state change without replacing the session (for `redirecting`, `submitting`). */
  setState(state: AuthState): void {
    this.state = state;
    this.emit();
  }

  onStateChange(listener: (change: AuthStateChange) => void): () => void {
    return this.sessionChanged.subscribe((session) => {
      listener({ state: this.state, session });
    });
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.current);
    }
  }
}
