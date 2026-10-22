import type { AuthFederationProvider } from './contract/auth.models';
import {
  DEFAULT_AUDIENCE,
  validateProviders,
  type AuthProviderRegistration,
} from './contract/providerRef';

/** Options accepted by `AuthKitConfiguration.customize(...)`. */
export interface AuthKitOptions {
  /** Origin of the host server that owns the federation endpoints. */
  readonly baseUrl: string;
  /** Host route that starts a Cl@ve login (`MapClave()` supplies it). */
  readonly loginPath?: string;
  /** Audience this plugin instance serves. */
  readonly audience?: string;
  /** Descriptors rendered by the UI. Never a hardcoded list. */
  readonly providers?: readonly AuthFederationProvider[];
  /** Aurelia route path the guard sends anonymous users to. */
  readonly loginRoute?: string;
}

/**
 * Validated, immutable plugin configuration.
 *
 * Unlike Aurelia v1 there is no mutation callback: the options object is
 * validated once, and every consumer reads the same frozen values.
 */
export class AuthKitConfig {
  readonly baseUrl: string;
  readonly loginPath: string;
  readonly audience: string;
  readonly providers: readonly AuthFederationProvider[];
  readonly loginRoute: string;

  constructor(options: AuthKitOptions) {
    if (typeof options.baseUrl !== 'string' || options.baseUrl.trim().length === 0) {
      throw new Error('AuthKit: baseUrl is required.');
    }

    let origin: string;
    try {
      origin = new URL(options.baseUrl).origin;
    } catch {
      throw new Error(`AuthKit: baseUrl "${options.baseUrl}" is not an absolute URL.`);
    }
    if (origin !== options.baseUrl.replace(/\/+$/, '')) {
      throw new Error('AuthKit: baseUrl must be an origin without a path.');
    }

    this.baseUrl = origin;
    this.loginPath = options.loginPath ?? '/clave/login';
    this.audience = options.audience ?? DEFAULT_AUDIENCE;
    this.providers = Object.freeze([...(options.providers ?? [])]);
    this.loginRoute = options.loginRoute ?? 'login';

    if (!this.loginPath.startsWith('/')) {
      throw new Error('AuthKit: loginPath must start with "/".');
    }

    validateProviders(this.providers, this.audience);
  }

  /** Absolute login endpoint, used to build federation URLs. */
  get loginUrl(): string {
    return new URL(this.loginPath, this.baseUrl).toString();
  }

  /** Descriptors paired with the audience this configuration serves. */
  get registrations(): readonly AuthProviderRegistration[] {
    return this.providers.map((provider) => ({ audience: this.audience, provider }));
  }
}
