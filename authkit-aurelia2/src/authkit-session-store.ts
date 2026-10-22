import type { AuthSession } from './contract/auth.models';

/**
 * In-memory, keyed session storage (spec-providers §4).
 *
 * One entry per canonical provider ref, so a citizen session and a staff
 * session can coexist without being merged. Nothing is persisted: the host's
 * server owns the session, and this store only mirrors what the host pushed.
 */
export class AuthKitSessionStore {
  private readonly entries = new Map<string, AuthSession>();

  get(ref: string): AuthSession | null {
    return this.entries.get(ref) ?? null;
  }

  put(ref: string, session: AuthSession): void {
    this.entries.set(ref, session);
  }

  /** Clears one provider's session, or every session when no ref is given. */
  clear(ref?: string): void {
    if (ref === undefined) {
      this.entries.clear();
      return;
    }
    this.entries.delete(ref);
  }

  get size(): number {
    return this.entries.size;
  }

  /** Read-only snapshot, keyed by canonical ref. */
  all(): ReadonlyMap<string, AuthSession> {
    return new Map(this.entries);
  }
}
