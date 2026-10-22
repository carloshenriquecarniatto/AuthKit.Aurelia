import { describe, expect, it } from 'vitest';
import { Container } from 'aurelia-dependency-injection';
import {
  AUTHKIT_SKIP_HEADER,
  AuthKitHttpInterceptor,
  AuthKitSession,
  configure,
} from '../src/index';
import { provider, session } from './fixtures';

function interceptor(signedIn: boolean): AuthKitHttpInterceptor {
  const container = new Container();
  configure({ container }, (config) => {
    config.baseUrl = 'https://auth.example.es';
    config.audience = 'clientes';
    config.providers = [provider('clave', { displayName: 'Cl@ve', isPrimary: true })];
  });
  if (signedIn) {
    container.get(AuthKitSession).setSession(session());
  }
  return container.get(AuthKitHttpInterceptor);
}

describe('AuthKitHttpInterceptor', () => {
  it('attaches the bearer token for a same-origin request', () => {
    const request = new Request('https://auth.example.es/api/expedientes');

    const result = interceptor(true).request(request);

    expect(result.headers.get('Authorization')).toBe('Bearer token-123');
  });

  it('attaches for a relative URL, resolved against baseUrl', () => {
    const headers = new Headers();
    const request = { url: '/api/expedientes', headers } as unknown as Request;

    const result = interceptor(true).request(request);
    const resultHeaders = (result as unknown as { headers: Headers }).headers;

    expect(resultHeaders.get('Authorization')).toBe('Bearer token-123');
  });

  it('does nothing without a token', () => {
    const request = new Request('https://auth.example.es/api/expedientes');

    const result = interceptor(false).request(request);

    expect(result.headers.get('Authorization')).toBeNull();
  });

  it('honours the per-request opt-out header and strips it', () => {
    const request = new Request('https://auth.example.es/api/public', {
      headers: { [AUTHKIT_SKIP_HEADER]: '1' },
    });

    const result = interceptor(true).request(request);

    expect(result.headers.get('Authorization')).toBeNull();
    expect(result.headers.get(AUTHKIT_SKIP_HEADER)).toBeNull();
  });

  it('never sends the token to another origin', () => {
    const request = new Request('https://api.other.example/collect');

    const result = interceptor(true).request(request);

    expect(result.headers.get('Authorization')).toBeNull();
  });

  it('leaves an Authorization set by the host untouched', () => {
    const request = new Request('https://auth.example.es/api/expedientes', {
      headers: { Authorization: 'Bearer host-token' },
    });

    const result = interceptor(true).request(request);

    expect(result.headers.get('Authorization')).toBe('Bearer host-token');
  });

  it('supports a plain header object as well as a Headers instance', () => {
    const request = {
      url: 'https://auth.example.es/api/expedientes',
      headers: { [AUTHKIT_SKIP_HEADER]: '1', Accept: 'application/json' },
    };

    const result = interceptor(true).request(request as unknown as Request);
    const headers = (result as unknown as { headers: Record<string, string> }).headers;

    expect(headers['Authorization']).toBeUndefined();
    expect(headers[AUTHKIT_SKIP_HEADER]).toBeUndefined();
    expect(headers['Accept']).toBe('application/json');
  });
});
