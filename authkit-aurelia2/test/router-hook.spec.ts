import { describe, expect, it } from 'vitest';
import { DI, Registration } from 'aurelia';
import { HttpClient } from '@aurelia/fetch-client';
import {
  AuthKitConfiguration,
  IAuthKitClient,
  IAuthKitRouteGuard,
  readAuthKitRequirement,
} from '../src/index';
import { navigationOptions, navigationParams, routeNode } from './support';
import { provider, session } from './fixtures';

function guard(signedIn: boolean, level: 'low' | 'substantial' | 'high' = 'high') {
  const container = DI.createContainer();
  container.register(Registration.singleton(HttpClient, HttpClient));
  container.register(
    AuthKitConfiguration.customize({
      baseUrl: 'https://auth.example.es',
      audience: 'clientes',
      loginRoute: 'login',
      providers: [provider('clave', { displayName: 'Cl@ve', isPrimary: true })],
    }),
  );

  if (signedIn) {
    const value = session();
    container.get(IAuthKitClient).setSession({
      ...value,
      user: {
        ...value.user,
        identity: value.user.identity === null ? null : { ...value.user.identity, level },
      },
    });
  }

  return container.get(IAuthKitRouteGuard);
}

function evaluate(guardInstance: ReturnType<typeof guard>, data: Parameters<typeof routeNode>[0]) {
  return guardInstance.canLoad(navigationParams, routeNode(data), null, navigationOptions);
}

describe('AuthKitRouteGuard (Aurelia v2 canLoad fallback)', () => {
  it('allows a route without authKit data', () => {
    expect(evaluate(guard(false), {})).toBe(true);
  });

  it('redirects an anonymous navigation to the login route', () => {
    const result = evaluate(guard(false), { authKit: { loa: 'high' } });

    expect(typeof result).toBe('string');
    expect(result).toContain('login?');
    expect(result).toContain('returnUrl=expedientes%2F7');
    expect(result).toContain('reason=authentication_required');
  });

  it('allows an authenticated session with a sufficient level', () => {
    expect(
      evaluate(guard(true, 'high'), { authKit: { loa: 'substantial', audience: 'clientes' } }),
    ).toBe(true);
  });

  it('fails closed when the granted level is below the requirement', () => {
    const result = evaluate(guard(true, 'low'), { authKit: { loa: 'high' } });

    expect(typeof result).toBe('string');
    expect(result).toContain('reason=loa_not_met');
  });

  it('rejects a session from another audience or provider', () => {
    const wrongAudience = evaluate(guard(true, 'high'), { authKit: { audience: 'intranet' } });
    expect(wrongAudience).toContain('reason=audience_mismatch');

    const wrongProvider = evaluate(guard(true, 'high'), {
      authKit: { providerRef: 'clientes/certificate' },
    });
    expect(wrongProvider).toContain('reason=audience_mismatch');
  });

  it('does not loop when the target already is the login route', () => {
    const guardInstance = guard(false);
    const result = guardInstance.canLoad(
      navigationParams,
      routeNode({ authKit: { loa: 'high' } }, 'login'),
      null,
      navigationOptions,
    );

    expect(result).toBe(true);
  });

  it('reads route data defensively', () => {
    expect(readAuthKitRequirement(undefined)).toBeNull();
    expect(readAuthKitRequirement({ authKit: true })).toBeNull();
    expect(readAuthKitRequirement({ authKit: { loa: 'extreme', audience: ' clientes ' } })).toEqual(
      {
        loa: null,
        audience: 'clientes',
        providerRef: null,
      },
    );
  });
});
