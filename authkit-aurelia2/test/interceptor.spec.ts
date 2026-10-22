import { describe, expect, it } from 'vitest';
import { DI, Registration } from 'aurelia';
import { HttpClient, IHttpClient } from '@aurelia/fetch-client';
import {
  AUTHKIT_SKIP_HEADER,
  AuthKitConfiguration,
  AuthKitHttpClient,
  AuthKitHttpInterceptor,
  IAuthKitClient,
} from '../src/index';
import { provider, session } from './fixtures';

function buildContainer(signedIn: boolean): ReturnType<typeof DI.createContainer> {
  const container = DI.createContainer();
  container.register(Registration.singleton(HttpClient, HttpClient));
  container.register(
    AuthKitConfiguration.customize({
      baseUrl: 'https://auth.example.es',
      audience: 'clientes',
      providers: [provider('clave', { displayName: 'Cl@ve', isPrimary: true })],
    }),
  );
  container.register(AuthKitHttpClient);

  if (signedIn) {
    container.get(IAuthKitClient).setSession(session());
  }

  return container;
}

describe('AuthKitHttpInterceptor', () => {
  it('is registered into the real IHttpClient through withInterceptor', () => {
    const container = buildContainer(true);
    const http = container.get(IHttpClient);
    const interceptor = container.get(AuthKitHttpInterceptor);

    expect(http.interceptors).toContain(interceptor);
  });

  it('attaches the bearer token to a same-origin request', () => {
    const interceptor = buildContainer(true).get(AuthKitHttpInterceptor);
    const request = new Request('https://auth.example.es/api/expedientes');

    const result = interceptor.request(request);

    expect(result.headers.get('Authorization')).toBe('Bearer token-123');
  });

  it('does nothing without a session token', () => {
    const interceptor = buildContainer(false).get(AuthKitHttpInterceptor);
    const request = new Request('https://auth.example.es/api/expedientes');

    const result = interceptor.request(request);

    expect(result.headers.get('Authorization')).toBeNull();
  });

  it('honours the opt-out header and strips it', () => {
    const interceptor = buildContainer(true).get(AuthKitHttpInterceptor);
    const request = new Request('https://auth.example.es/api/public', {
      headers: { [AUTHKIT_SKIP_HEADER]: '1' },
    });

    const result = interceptor.request(request);

    expect(result.headers.get('Authorization')).toBeNull();
    expect(result.headers.get(AUTHKIT_SKIP_HEADER)).toBeNull();
  });

  it('never sends the token to another origin', () => {
    const interceptor = buildContainer(true).get(AuthKitHttpInterceptor);
    const request = new Request('https://api.other.example/collect');

    const result = interceptor.request(request);

    expect(result.headers.get('Authorization')).toBeNull();
  });

  it('resolves a relative URL against baseUrl', () => {
    const interceptor = buildContainer(true).get(AuthKitHttpInterceptor);
    const headers = new Headers();
    const request = { url: '/api/expedientes', headers } as unknown as Request;

    const result = interceptor.request(request);

    expect((result as unknown as { headers: Headers }).headers.get('Authorization')).toBe(
      'Bearer token-123',
    );
  });
});
