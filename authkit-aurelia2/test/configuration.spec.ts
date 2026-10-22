import { describe, expect, it } from 'vitest';
import { DI, Registration } from 'aurelia';
import { HttpClient } from '@aurelia/fetch-client';
import {
  AuthKitClient,
  AuthKitConfig,
  AuthKitConfiguration,
  AuthKitHttpInterceptor,
  AuthKitRouteGuard,
  AuthKitSessionStore,
  IAuthKitClient,
  IAuthKitRouteGuard,
} from '../src/index';
import { provider } from './fixtures';

function buildContainer(): ReturnType<typeof DI.createContainer> {
  const container = DI.createContainer();
  container.register(Registration.singleton(HttpClient, HttpClient));
  container.register(
    AuthKitConfiguration.customize({
      baseUrl: 'https://auth.example.es',
      audience: 'clientes',
      loginRoute: 'login',
      providers: [
        provider('clave', { displayName: 'Cl@ve', isPrimary: true }),
        provider('certificate', { displayName: 'Certificate' }),
      ],
    }),
  );
  return container;
}

describe('AuthKitConfiguration', () => {
  it('registers the client, the session store and the guard as singletons', () => {
    const container = buildContainer();

    expect(container.get(IAuthKitClient)).toBe(container.get(IAuthKitClient));
    expect(container.get(AuthKitSessionStore)).toBe(container.get(AuthKitSessionStore));
    expect(container.get(IAuthKitRouteGuard)).toBe(container.get(IAuthKitRouteGuard));
    expect(container.get(AuthKitHttpInterceptor)).toBe(container.get(AuthKitHttpInterceptor));

    expect(container.get(IAuthKitClient)).toBeInstanceOf(AuthKitClient);
    expect(container.get(AuthKitRouteGuard)).toBeInstanceOf(AuthKitRouteGuard);

    expect(container.get(AuthKitConfig).audience).toBe('clientes');
    expect(container.get(AuthKitConfig).providers).toHaveLength(2);
    expect(container.get(AuthKitConfig).loginUrl).toBe('https://auth.example.es/clave/login');
  });

  it('validates the options before the container is touched', () => {
    expect(() => AuthKitConfiguration.customize({ baseUrl: '' })).toThrow(/baseUrl/);
    expect(() => AuthKitConfiguration.customize({ baseUrl: '/relative' })).toThrow(/absolute/);
    expect(() =>
      AuthKitConfiguration.customize({
        baseUrl: 'https://auth.example.es',
        providers: [provider('a'), provider('b', { displayName: 'A' })],
      }),
    ).toThrow(/Display name/);
    expect(() =>
      AuthKitConfiguration.customize({
        baseUrl: 'https://auth.example.es',
        providers: [provider('a'), provider('b', { displayName: 'B' })],
      }),
    ).toThrow(/none is primary/);
  });
});
