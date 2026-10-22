import type { Container } from 'aurelia-dependency-injection';
import type { HttpClient } from 'aurelia-fetch-client';
import type { RouterConfiguration } from 'aurelia-router';
import { AuthKitConfig, type AuthKitOptions } from './authkit-config';
import { AuthKitClient } from './authkit-client';
import { AuthKitSession } from './authkit-session';
import { AuthKitHttpInterceptor } from './authkit-http-interceptor';
import { AuthKitAuthorizeStep } from './authkit-authorize-step';

/** The slice of `Aurelia` the plugin needs; a real Aurelia satisfies it. */
export interface AuthKitPluginHost {
  readonly container: Container;
}

/** A mutation callback (documented v1 style) or a plain options object. */
export type AuthKitPluginConfig = Partial<AuthKitOptions> | ((config: AuthKitConfig) => void);

/**
 * Registers `AuthKitConfig`, `AuthKitSession`, `AuthKitClient`, the HTTP
 * interceptor and the router pipeline step in Aurelia's own container.
 *
 * ```ts
 * aurelia.use.plugin(PLATFORM.moduleName('@authkit/aurelia'), (config) => {
 *   config.baseUrl = 'https://auth.example.es';
 *   config.audience = 'clients';
 *   config.providers = descriptors;
 *   config.loginRoute = 'login';
 * });
 * ```
 */
export function configure(
  aurelia: AuthKitPluginHost,
  options?: AuthKitPluginConfig,
): AuthKitConfig {
  return registerAuthKit(aurelia.container, options);
}

export function registerAuthKit(
  container: Container,
  options?: AuthKitPluginConfig,
): AuthKitConfig {
  const config = new AuthKitConfig(typeof options === 'function' ? undefined : options);
  if (typeof options === 'function') {
    options(config);
  }
  config.validate();

  container.registerInstance(AuthKitConfig, config);
  container.registerSingleton(AuthKitSession, AuthKitSession);
  container.registerSingleton(AuthKitClient, AuthKitClient);
  container.registerSingleton(AuthKitHttpInterceptor, AuthKitHttpInterceptor);
  container.registerSingleton(AuthKitAuthorizeStep, AuthKitAuthorizeStep);

  return config;
}

/**
 * Adds the singleton interceptor to the host's `HttpClient`.
 * Call it once, after the plugin is registered.
 */
export function registerAuthKitHttpInterceptor(
  http: HttpClient,
  container: Container,
): AuthKitHttpInterceptor {
  const interceptor = container.get(AuthKitHttpInterceptor);
  http.configure((config) => {
    config.withInterceptor(interceptor);
  });
  return interceptor;
}

/**
 * Adds the authorize step to the host's router configuration:
 *
 * ```ts
 * configureRouter(config: RouterConfiguration): void {
 *   addAuthKitAuthorizeStep(config);
 * }
 * ```
 */
export function addAuthKitAuthorizeStep(config: RouterConfiguration): void {
  config.addPipelineStep('authorize', AuthKitAuthorizeStep);
}

export { AuthKitConfig, type AuthKitOptions } from './authkit-config';
export { AuthKitClient, callbackUrlWithoutOutcome, mapCallbackError } from './authkit-client';
export {
  AuthKitSession,
  type AuthSessionChannel,
  type AuthSessionListener,
} from './authkit-session';
export { AuthKitHttpInterceptor, AUTHKIT_SKIP_HEADER } from './authkit-http-interceptor';
export {
  AuthKitAuthorizeStep,
  authKitLoginUrl,
  hasLevel,
  readAuthKitRequirement,
  type AuthKitRedirectReason,
  type AuthKitRouteRequirement,
} from './authkit-authorize-step';
export {
  AuthProviderResolutionError,
  DEFAULT_AUDIENCE,
  formatProviderRef,
  isProviderRefSegment,
  parseProviderRef,
  providerRefOf,
  resolveProvider,
  satisfiesLoa,
  validateProviders,
  type AuthProviderRef,
  type AuthProviderRegistration,
  type AuthProviderResolutionCode,
  type ProviderResolutionRequest,
} from './contract/providerRef';
export type {
  AuthAssuranceLevel,
  AuthCapabilities,
  AuthDocumentType,
  AuthError,
  AuthErrorCode,
  AuthFederationMethod,
  AuthFederationProvider,
  AuthIdentity,
  AuthNextStep,
  AuthProviderSnapshot,
  AuthResult,
  AuthSession,
  AuthState,
  AuthUser,
} from './contract/auth.models';
export type {
  AuthFederationRequest,
  AuthProvider,
  AuthSessionStore,
  AuthStateChange,
  InitializableAuthProvider,
  ServerDrivenAuthProvider,
} from './contract/auth.provider';
export type { AuthFederationProvider as AuthFederationDescriptor } from './contract/auth.models';
