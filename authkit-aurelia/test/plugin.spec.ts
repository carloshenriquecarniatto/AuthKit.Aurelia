import { describe, expect, it } from 'vitest';
import { Container } from 'aurelia-dependency-injection';
import { HttpClient } from 'aurelia-fetch-client';
import { RouterConfiguration } from 'aurelia-router';
import {
  AuthKitAuthorizeStep,
  AuthKitClient,
  AuthKitHttpInterceptor,
  AuthKitSession,
  addAuthKitAuthorizeStep,
  configure,
  registerAuthKitHttpInterceptor,
} from '../src/index';
import { AuthKitConfig } from '../src/authkit-config';
import { provider } from './fixtures';

function register(container: Container): AuthKitConfig {
  return configure({ container }, (config) => {
    config.baseUrl = 'https://auth.example.es';
    config.audience = 'clientes';
    config.providers = [provider('clave', { displayName: 'Cl@ve', isPrimary: true })];
    config.loginRoute = 'login';
  });
}

describe('Aurelia v1 plugin registration', () => {
  it('registers client and session as singletons in the real container', () => {
    const container = new Container();
    const config = register(container);

    expect(container.get(AuthKitConfig)).toBe(config);
    expect(container.get(AuthKitSession)).toBe(container.get(AuthKitSession));
    expect(container.get(AuthKitClient)).toBe(container.get(AuthKitClient));
    expect(container.get(AuthKitHttpInterceptor)).toBe(container.get(AuthKitHttpInterceptor));
    expect(container.get(AuthKitAuthorizeStep)).toBe(container.get(AuthKitAuthorizeStep));
  });

  it('shares the session instance between client and interceptor', () => {
    const container = new Container();
    register(container);

    const session = container.get(AuthKitSession);
    const client = container.get(AuthKitClient);

    client.setSession(null);
    expect(session.isAuthenticated).toBe(false);
    expect(client.currentSession).toBeNull();
  });

  it('validates configuration at startup', () => {
    const container = new Container();

    expect(() =>
      configure({ container }, (config) => {
        config.baseUrl = 'not-a-url';
      }),
    ).toThrow(/baseUrl/);

    expect(() =>
      configure({ container }, (config) => {
        config.baseUrl = 'https://auth.example.es';
        config.providers = [
          provider('a', { displayName: 'Same' }),
          provider('b', { displayName: 'Same' }),
        ];
      }),
    ).toThrow(/Display name/);
  });

  it('adds the interceptor to a real HttpClient through withInterceptor', () => {
    const container = new Container();
    register(container);
    const http = new HttpClient();

    const interceptor = registerAuthKitHttpInterceptor(http, container);

    expect(http.interceptors).toContain(interceptor);
    expect(http.interceptors).toHaveLength(1);
  });

  it('adds the authorize step to a real RouterConfiguration pipeline', () => {
    const routing = new RouterConfiguration();

    addAuthKitAuthorizeStep(routing);

    expect(routing.pipelineSteps).toContainEqual({
      name: 'authorize',
      step: AuthKitAuthorizeStep,
    });
  });
});
