import type { AuthFederationProvider } from './contract/auth.models';
import {
  DEFAULT_AUDIENCE,
  validateProviders,
  type AuthProviderRegistration,
} from './contract/providerRef';

/**
 * Plugin configuration for Aurelia v1.
 *
 * The host mutates these fields inside the plugin callback, which is the
 * documented v1 pattern:
 *
 * ```ts
 * aurelia.use.plugin(PLATFORM.moduleName('@authkit/aurelia'), (config) => {
 *   config.baseUrl = 'https://auth.example.es';
 *   config.audience = 'clients';
 * });
 * ```
 */
export interface AuthKitOptions {
  /** Origin of the host server that owns the federation endpoints. */
  readonly baseUrl: string;
  /** Host route that starts a Cl@ve login (`MapClave()` supplies it). */
  readonly loginPath: string;
  /** Host route that receives the ACS redirect. Null when the host does not need it. */
  readonly logoutPath: string | null;
  /** Host route that returns the current server-side session, when the host exposes one. */
  readonly sessionPath: string | null;
  /** Audience this plugin instance serves. */
  readonly audience: string;
  /** Descriptors rendered by the UI. Never a hardcoded list. */
  readonly providers: readonly AuthFederationProvider[];
  /** Aurelia route name or path the authorize step sends anonymous users to. */
  readonly loginRoute: string;
}

export class AuthKitConfig implements AuthKitOptions {
  baseUrl = '';
  loginPath = '/clave/login';
  logoutPath: string | null = null;
  sessionPath: string | null = null;
  audience = DEFAULT_AUDIENCE;
  providers: readonly AuthFederationProvider[] = [];
  loginRoute = 'login';

  constructor(init?: Partial<AuthKitOptions>) {
    if (init !== undefined) {
      Object.assign(this, init);
    }
  }

  /** Validates at startup, not at the first login (spec-providers §3). */
  validate(): void {
    if (this.baseUrl.trim().length === 0) {
      throw new Error('AuthKit: baseUrl is required.');
    }
    let origin: string;
    try {
      origin = new URL(this.baseUrl).origin;
    } catch {
      throw new Error(`AuthKit: baseUrl "${this.baseUrl}" is not an absolute URL.`);
    }
    if (origin !== this.baseUrl.replace(/\/+$/, '')) {
      throw new Error('AuthKit: baseUrl must be an origin without a path.');
    }
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
