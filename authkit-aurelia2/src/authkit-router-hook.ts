import { DI } from 'aurelia';
import type { INavigationOptions, Params, RouteNode } from '@aurelia/router';
import type { AuthAssuranceLevel, AuthSession } from './contract/auth.models';
import { AuthKitConfig } from './authkit-config';
import { IAuthKitClient } from './authkit-client';

/** What a route declares in `data.authKit`. */
export interface AuthKitRouteRequirement {
  readonly loa?: AuthAssuranceLevel | null;
  readonly audience?: string | null;
  readonly providerRef?: string | null;
}

export type AuthKitRedirectReason = 'authentication_required' | 'loa_not_met' | 'audience_mismatch';

/** The route `canLoad` hook this package exposes (Aurelia v2.0.0-rc.2 shape). */
export type AuthKitCanLoad = (
  params: Params,
  next: RouteNode,
  current: RouteNode | null,
  options: INavigationOptions,
) => boolean | string;

export interface IAuthKitRouteGuard {
  readonly canLoad: AuthKitCanLoad;
}

export const IAuthKitRouteGuard = DI.createInterface<IAuthKitRouteGuard>('IAuthKitRouteGuard');

const LEVELS: readonly string[] = ['low', 'substantial', 'high'];

const LEVEL_RANK: Readonly<Record<string, number>> = {
  low: 1,
  substantial: 2,
  high: 3,
};

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

  return {
    loa: loa !== null && LEVELS.includes(loa) ? (loa as AuthAssuranceLevel) : null,
    audience: asTrimmedString(raw['audience']),
    providerRef: asTrimmedString(raw['providerRef']),
  };
}

export interface AuthKitNavigationSnapshot {
  readonly session: AuthSession | null;
  readonly loa: AuthAssuranceLevel | null;
}

export type AuthKitDecision =
  { readonly allow: true } | { readonly allow: false; readonly redirectTo: string };

/** Pure decision function, so the rule is testable without a router instance. */
export function decideAuthKitNavigation(
  snapshot: AuthKitNavigationSnapshot,
  requirement: AuthKitRouteRequirement | null,
  targetPath: string,
  config: AuthKitConfig,
): AuthKitDecision {
  if (requirement === null) {
    return { allow: true };
  }

  if (targetPath === config.loginRoute || targetPath.startsWith(`${config.loginRoute}?`)) {
    return { allow: true };
  }

  if (snapshot.session === null) {
    return redirect(config, targetPath, 'authentication_required');
  }

  if (
    requirement.audience !== null &&
    requirement.audience !== (snapshot.session.provider?.audience ?? null)
  ) {
    return redirect(config, targetPath, 'audience_mismatch');
  }

  if (
    requirement.providerRef !== null &&
    requirement.providerRef !== (snapshot.session.provider?.ref ?? null)
  ) {
    return redirect(config, targetPath, 'audience_mismatch');
  }

  if (requirement.loa !== null && requirement.loa !== undefined) {
    const granted = snapshot.loa === null ? 0 : (LEVEL_RANK[snapshot.loa] ?? 0);
    const required = LEVEL_RANK[requirement.loa] ?? Number.POSITIVE_INFINITY;
    if (granted < required) {
      return redirect(config, targetPath, 'loa_not_met');
    }
  }

  return { allow: true };
}

function redirect(
  config: AuthKitConfig,
  returnUrl: string,
  reason: AuthKitRedirectReason,
): AuthKitDecision {
  const params = new URLSearchParams();
  if (returnUrl.length > 0) {
    params.set('returnUrl', returnUrl);
  }
  params.set('reason', reason);
  const separator = config.loginRoute.includes('?') ? '&' : '?';
  return { allow: false, redirectTo: `${config.loginRoute}${separator}${params.toString()}` };
}

/**
 * Route guard for Aurelia v2.0.0-rc.2.
 *
 * That release has no `IRouter.addHook` (checked against the installed types), so
 * the supported shape is a component-level `canLoad` hook the host opts into:
 *
 * ```ts
 * import { resolve } from 'aurelia';
 * import { IAuthKitRouteGuard } from '@authkit/aurelia2';
 *
 * export class Expedientes {
 *   canLoad = resolve(IAuthKitRouteGuard).canLoad;
 * }
 * ```
 *
 * The guard returns `true` or a login URL string. It never calls the router.
 */
export class AuthKitRouteGuard implements IAuthKitRouteGuard {
  static inject = [AuthKitConfig, IAuthKitClient];

  constructor(
    private readonly config: AuthKitConfig,
    private readonly client: IAuthKitClient,
  ) {}

  readonly canLoad: AuthKitCanLoad = (_params, next, _current, _options) => {
    const requirement = readAuthKitRequirement(next.data);
    const targetPath = next.finalPath?.length > 0 ? next.finalPath : next.path;
    const decision = decideAuthKitNavigation(
      { session: this.client.session, loa: this.client.loa },
      requirement,
      targetPath,
      this.config,
    );

    return decision.allow ? true : decision.redirectTo;
  };
}
