import type { AuthFederationProvider } from './auth.models';

/** Canonical identity of a provider: `audience/providerId` (spec-providers §2). */
export interface AuthProviderRef {
  readonly audience: string;
  readonly providerId: string;
}

/** A descriptor together with the audience it was registered for. */
export interface AuthProviderRegistration {
  readonly audience: string;
  readonly provider: AuthFederationProvider;
}

/** One segment of a ref. `/` is forbidden, so the pattern rejects it by construction. */
export const PROVIDER_REF_SEGMENT = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** Reserved audience used by single-provider mode (spec-providers §2.1). */
export const DEFAULT_AUDIENCE = 'default';

export type AuthProviderResolutionCode =
  'provider_ambiguous' | 'provider_not_configured' | 'provider_ref_malformed';

/** Raised when routing cannot produce exactly one provider, or the input is malformed. */
export class AuthProviderResolutionError extends Error {
  readonly code: AuthProviderResolutionCode;

  constructor(code: AuthProviderResolutionCode, message: string) {
    super(message);
    this.name = 'AuthProviderResolutionError';
    this.code = code;
  }
}

export function isProviderRefSegment(value: string): boolean {
  return PROVIDER_REF_SEGMENT.test(value);
}

/** Parses `audience/providerId`. Throws `provider_ref_malformed` on any other shape. */
export function parseProviderRef(ref: string): AuthProviderRef {
  const parts = ref.split('/');
  if (parts.length !== 2) {
    throw new AuthProviderResolutionError(
      'provider_ref_malformed',
      `Provider ref "${ref}" must be "audience/providerId".`,
    );
  }

  const [audience, providerId] = parts as [string, string];
  if (!isProviderRefSegment(audience) || !isProviderRefSegment(providerId)) {
    throw new AuthProviderResolutionError(
      'provider_ref_malformed',
      `Provider ref "${ref}" must match ^[a-z0-9][a-z0-9._-]{0,63}$ in both segments.`,
    );
  }

  return { audience, providerId };
}

export function formatProviderRef(ref: AuthProviderRef): string {
  return `${ref.audience}/${ref.providerId}`;
}

export function providerRefOf(registration: AuthProviderRegistration): string {
  return formatProviderRef({
    audience: registration.audience,
    providerId: registration.provider.id,
  });
}

export interface ProviderResolutionRequest {
  /** Rule 1. Canonical `audience/providerId`. */
  readonly providerRef?: string | null;
  /** Rule 1. A bare id, resolved inside the audience scope when one is given. */
  readonly providerId?: string | null;
  /** Rules 2–6. The audience declared by the screen. */
  readonly audience?: string | null;
}

/**
 * Resolves exactly one provider, following the six ordered rules of
 * spec-providers §3. Anything the rules cannot decide fails; it is never guessed.
 */
export function resolveProvider(
  registrations: readonly AuthProviderRegistration[],
  request: ProviderResolutionRequest = {},
): AuthFederationProvider {
  const audience = request.audience?.trim() || null;
  const explicitRef = request.providerRef?.trim() || null;
  const explicitId = request.providerId?.trim() || null;

  if (explicitRef !== null) {
    return resolveExplicitRef(registrations, parseProviderRef(explicitRef), audience);
  }

  if (explicitId !== null) {
    return resolveExplicitId(registrations, explicitId, audience);
  }

  if (audience !== null) {
    return resolveAudience(registrations, audience);
  }

  const defaults = registrations.filter((entry) => entry.audience === DEFAULT_AUDIENCE);
  if (defaults.length > 0) {
    return resolveAudience(registrations, DEFAULT_AUDIENCE);
  }

  if (registrations.length === 1) {
    return (registrations[0] as AuthProviderRegistration).provider;
  }

  throw new AuthProviderResolutionError(
    'provider_ambiguous',
    `No audience was given and the registry has ${registrations.length} providers in different audiences.`,
  );
}

function resolveExplicitRef(
  registrations: readonly AuthProviderRegistration[],
  ref: AuthProviderRef,
  audience: string | null,
): AuthFederationProvider {
  // Rule 6: an explicit ref never crosses an audience boundary.
  if (audience !== null && audience !== ref.audience) {
    throw new AuthProviderResolutionError(
      'provider_not_configured',
      `Provider "${formatProviderRef(ref)}" does not belong to audience "${audience}".`,
    );
  }

  const match = registrations.find(
    (entry) => entry.audience === ref.audience && entry.provider.id === ref.providerId,
  );

  if (match === undefined) {
    throw new AuthProviderResolutionError(
      'provider_not_configured',
      `Provider "${formatProviderRef(ref)}" is not registered.`,
    );
  }

  return match.provider;
}

function resolveExplicitId(
  registrations: readonly AuthProviderRegistration[],
  providerId: string,
  audience: string | null,
): AuthFederationProvider {
  if (!isProviderRefSegment(providerId)) {
    throw new AuthProviderResolutionError(
      'provider_ref_malformed',
      `Provider id "${providerId}" must match ^[a-z0-9][a-z0-9._-]{0,63}$.`,
    );
  }

  const candidates = registrations.filter(
    (entry) =>
      entry.provider.id === providerId && (audience === null || entry.audience === audience),
  );

  if (candidates.length === 0) {
    throw new AuthProviderResolutionError(
      'provider_not_configured',
      audience === null
        ? `Provider "${providerId}" is not registered.`
        : `Provider "${providerId}" is not registered in audience "${audience}".`,
    );
  }

  if (candidates.length > 1) {
    throw new AuthProviderResolutionError(
      'provider_ambiguous',
      `Provider id "${providerId}" exists in ${candidates.length} audiences; pass a full ref.`,
    );
  }

  return (candidates[0] as AuthProviderRegistration).provider;
}

function resolveAudience(
  registrations: readonly AuthProviderRegistration[],
  audience: string,
): AuthFederationProvider {
  // Rule 6: look only inside the requested audience, never fall back to another.
  const candidates = registrations.filter((entry) => entry.audience === audience);

  if (candidates.length === 0) {
    throw new AuthProviderResolutionError(
      'provider_not_configured',
      `Audience "${audience}" has no registered provider.`,
    );
  }

  // Rule 3: the audience's primary provider wins.
  const primaries = candidates.filter((entry) => entry.provider.isPrimary);
  if (primaries.length > 1) {
    throw new AuthProviderResolutionError(
      'provider_ambiguous',
      `Audience "${audience}" declares ${primaries.length} primary providers.`,
    );
  }
  if (primaries.length === 1) {
    return (primaries[0] as AuthProviderRegistration).provider;
  }

  // Rule 4: a single-provider audience is unambiguous.
  if (candidates.length === 1) {
    return (candidates[0] as AuthProviderRegistration).provider;
  }

  // Rule 5: never guess, never first-registered.
  throw new AuthProviderResolutionError(
    'provider_ambiguous',
    `Audience "${audience}" has ${candidates.length} providers and none is primary.`,
  );
}

/**
 * Startup validation of descriptor lists (spec-providers §6 rules 1–4).
 * Fails fast instead of producing two indistinguishable buttons at runtime.
 */
export function validateProviders(
  providers: readonly AuthFederationProvider[],
  audience: string,
): void {
  const ids = new Set<string>();
  const names = new Set<string>();
  let primaries = 0;

  for (const provider of providers) {
    if (!isProviderRefSegment(provider.id)) {
      throw new AuthProviderResolutionError(
        'provider_ref_malformed',
        `Provider id "${provider.id}" in audience "${audience}" is not a valid ref segment.`,
      );
    }
    if (ids.has(provider.id)) {
      throw new AuthProviderResolutionError(
        'provider_ambiguous',
        `Provider id "${provider.id}" is registered twice in audience "${audience}".`,
      );
    }
    if (names.has(provider.displayName)) {
      throw new AuthProviderResolutionError(
        'provider_ambiguous',
        `Display name "${provider.displayName}" is used twice in audience "${audience}".`,
      );
    }
    ids.add(provider.id);
    names.add(provider.displayName);
    if (provider.isPrimary) {
      primaries += 1;
    }
  }

  if (primaries > 1) {
    throw new AuthProviderResolutionError(
      'provider_ambiguous',
      `Audience "${audience}" declares ${primaries} primary providers.`,
    );
  }

  if (providers.length > 1 && primaries === 0) {
    throw new AuthProviderResolutionError(
      'provider_ambiguous',
      `Audience "${audience}" has ${providers.length} providers and none is primary.`,
    );
  }
}

/** eIDAS levels are ordered; absent values fail closed (spec-clave R-09). */
const LOA_RANK: Readonly<Record<string, number>> = {
  low: 1,
  substantial: 2,
  high: 3,
};

export function satisfiesLoa(
  granted: string | null | undefined,
  required: string | null | undefined,
): boolean {
  if (required === null || required === undefined) {
    return true;
  }
  const grantedRank = granted === null || granted === undefined ? 0 : (LOA_RANK[granted] ?? 0);
  const requiredRank = LOA_RANK[required] ?? Number.POSITIVE_INFINITY;
  return grantedRank >= requiredRank;
}
