import { Redirect, type NavigationInstruction, type Next } from 'aurelia-router';
import type { AuthAssuranceLevel } from './contract/auth.models';
import { AuthKitConfig } from './authkit-config';
import { AuthKitSession } from './authkit-session';

/** What a route declares in `data.authKit`. */
export interface AuthKitRouteRequirement {
  readonly loa?: AuthAssuranceLevel | null;
  readonly audience?: string | null;
  readonly providerRef?: string | null;
}

export type AuthKitRedirectReason = 'authentication_required' | 'loa_not_met' | 'audience_mismatch';

const LEVELS: readonly string[] = ['low', 'substantial', 'high'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Reads `data.authKit` without trusting its shape. */
export function readAuthKitRequirement(data: unknown): AuthKitRouteRequirement | null {
  if (!isRecord(data)) {
    return null;
  }

  const raw = data['authKit'];
  if (!isRecord(raw)) {
    return null;
  }

  const loa = asTrimmedString(raw['loa']);
  const audience = asTrimmedString(raw['audience']);
  const providerRef = asTrimmedString(raw['providerRef']);

  return {
    loa: loa !== null && LEVELS.includes(loa) ? (loa as AuthAssuranceLevel) : null,
    audience,
    providerRef,
  };
}

/** Builds the login URL the step redirects to. Never navigates by itself. */
export function authKitLoginUrl(
  config: AuthKitConfig,
  returnUrl: string | null,
  reason: AuthKitRedirectReason,
): string {
  const params = new URLSearchParams();
  if (returnUrl !== null && returnUrl.length > 0) {
    params.set('returnUrl', returnUrl);
  }
  params.set('reason', reason);
  const separator = config.loginRoute.includes('?') ? '&' : '?';
  return `${config.loginRoute}${separator}${params.toString()}`;
}

/**
 * Aurelia v1 router pipeline step.
 *
 * The host registers it once, which is the documented v1 pattern:
 *
 * ```ts
 * router.addPipelineStep('authorize', AuthKitAuthorizeStep);
 * ```
 *
 * Routes opt in with `data: { authKit: { loa: 'high', audience: 'clients' } }`.
 * The step cancels navigation with a real `Redirect`; it does not touch the
 * history API or the router directly (spec-host-integration §6).
 */
export class AuthKitAuthorizeStep {
  static inject = [AuthKitSession, AuthKitConfig];

  constructor(
    private readonly authSession: AuthKitSession,
    private readonly config: AuthKitConfig,
  ) {}

  run(navigationInstruction: NavigationInstruction, next: Next): Promise<unknown> {
    const requirement = readAuthKitRequirement(navigationInstruction.config?.data);

    if (requirement === null) {
      return next();
    }

    const currentUrl = navigationInstruction.fragment ?? '';
    if (
      currentUrl === this.config.loginRoute ||
      currentUrl.startsWith(`${this.config.loginRoute}?`)
    ) {
      return next();
    }

    if (!this.authSession.isAuthenticated) {
      return next.cancel(
        new Redirect(authKitLoginUrl(this.config, currentUrl, 'authentication_required')),
      );
    }

    if (requirement.audience !== null && requirement.audience !== this.authSession.audience) {
      return next.cancel(
        new Redirect(authKitLoginUrl(this.config, currentUrl, 'audience_mismatch')),
      );
    }

    if (
      requirement.providerRef !== null &&
      requirement.providerRef !== this.authSession.providerRef
    ) {
      return next.cancel(
        new Redirect(authKitLoginUrl(this.config, currentUrl, 'audience_mismatch')),
      );
    }

    if (
      requirement.loa !== null &&
      requirement.loa !== undefined &&
      !hasLevel(this.authSession.loa, requirement.loa)
    ) {
      return next.cancel(new Redirect(authKitLoginUrl(this.config, currentUrl, 'loa_not_met')));
    }

    return next();
  }
}

const LEVEL_RANK: Readonly<Record<string, number>> = {
  low: 1,
  substantial: 2,
  high: 3,
};

/** Fail-closed level comparison: an absent level satisfies nothing but "absent". */
export function hasLevel(
  granted: AuthAssuranceLevel | null,
  required: AuthAssuranceLevel | null,
): boolean {
  if (required === null) {
    return true;
  }
  const grantedRank = granted === null ? 0 : (LEVEL_RANK[granted] ?? 0);
  return grantedRank >= (LEVEL_RANK[required] ?? Number.POSITIVE_INFINITY);
}
