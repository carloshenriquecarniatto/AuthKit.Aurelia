import { describe, expect, it } from 'vitest';
import { Container } from 'aurelia-dependency-injection';
import {
  AuthKitClient,
  AuthKitSession,
  callbackUrlWithoutOutcome,
  configure,
  mapCallbackError,
} from '../src/index';
import type { AuthSession } from '../src/contract/auth.models';
import { provider, session } from './fixtures';

function containerWith(): Container {
  const container = new Container();
  configure({ container }, (config) => {
    config.baseUrl = 'https://auth.example.es';
    config.audience = 'clientes';
    config.loginPath = '/clave/login';
    config.loginRoute = 'login';
    config.providers = [
      provider('clave', { displayName: 'Cl@ve', isPrimary: true }),
      provider('certificate', { displayName: 'Certificate' }),
    ];
  });
  return container;
}

describe('AuthKitSession', () => {
  it('exposes plain v1 properties derived from the session', () => {
    const sessionService = new AuthKitSession();
    const value = session();

    sessionService.setSession(value);

    expect(sessionService.session).toBe(value);
    expect(sessionService.user?.displayName).toBe('Maria Example');
    expect(sessionService.loa).toBe('high');
    expect(sessionService.isAuthenticated).toBe(true);
    expect(sessionService.audience).toBe('clientes');
    expect(sessionService.providerRef).toBe('clientes/clave');
    expect(sessionService.authState).toBe('authenticated');
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const sessionService = new AuthKitSession();
    const seen: Array<AuthSession | null> = [];
    const unsubscribe = sessionService.sessionChanged.subscribe((value) => seen.push(value));

    sessionService.setSession(session());
    sessionService.setSession(null);
    unsubscribe();
    sessionService.setSession(session());

    expect(seen).toHaveLength(2);
    expect(seen[0]?.user.id).toBe('subject-opaque');
    expect(seen[1]).toBeNull();
    expect(sessionService.sessionChanged.size).toBe(0);
  });

  it('signs out with a plain method and notifies', async () => {
    const sessionService = new AuthKitSession();
    sessionService.setSession(session());
    let calls = 0;
    sessionService.sessionChanged.subscribe(() => (calls += 1));

    await sessionService.signOut();

    expect(calls).toBe(1);
    expect(sessionService.isAuthenticated).toBe(false);
    expect(sessionService.authState).toBe('idle');
  });
});

describe('AuthKitClient federation surface', () => {
  it('builds the host login URL and never navigates', async () => {
    const container = containerWith();
    const client = container.get(AuthKitClient);
    const sessionService = container.get(AuthKitSession);

    const url = await client.beginFederation(
      'clientes/clave',
      'substantial',
      'clave_movil',
      '/expedientes',
    );

    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://auth.example.es');
    expect(parsed.pathname).toBe('/clave/login');
    expect(parsed.searchParams.get('loa')).toBe('substantial');
    expect(parsed.searchParams.get('method')).toBe('clave_movil');
    expect(parsed.searchParams.get('returnUrl')).toBe('/expedientes');
    expect(parsed.searchParams.get('provider')).toBe('clientes/clave');
    expect(sessionService.authState).toBe('redirecting');
  });

  it('refuses a provider or level the descriptor does not offer', async () => {
    const client = containerWith().get(AuthKitClient);

    await expect(client.beginFederation('clientes/unknown', 'substantial')).rejects.toThrow(
      /not registered/,
    );
    await expect(client.beginFederation('clientes/clave', 'low')).rejects.toThrow(
      /does not offer assurance level/,
    );
    await expect(client.beginFederation('clientes/clave', 'high', 'clave_pin')).rejects.toThrow(
      /does not offer method/,
    );
  });

  it('reads only error and error_reason from the callback', () => {
    const container = containerWith();
    const client = container.get(AuthKitClient);
    const sessionService = container.get(AuthKitSession);

    const cancelled = client.completeFederation(
      'https://app.example.es/callback?error=access_denied&error_reason=cancelled',
    );
    expect(cancelled.ok).toBe(false);
    expect(cancelled.error?.code).toBe('federation_cancelled');

    const downgraded = client.completeFederation(
      'https://app.example.es/callback?error_reason=loa_not_met',
    );
    expect(downgraded.error?.code).toBe('loa_not_met');

    const unknown = client.completeFederation(
      'https://app.example.es/callback?error=invalid_request&error_reason=signature_invalid',
    );
    expect(unknown.error?.code).toBe('federation_failed');

    sessionService.setSession(session());
    const success = client.completeFederation('https://app.example.es/expedientes');
    expect(success.ok).toBe(true);
    expect(success.session?.user.identity?.documentType).toBe('dni');
  });

  it('fails closed when the host has no session after the redirect', () => {
    const client = containerWith().get(AuthKitClient);

    const result = client.completeFederation('https://app.example.es/expedientes');

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('identity_not_verified');
    expect(result.session).toBeNull();
  });

  it('strips the outcome parameters from the callback URL', () => {
    const cleaned = callbackUrlWithoutOutcome(
      'https://app.example.es/callback?error=access_denied&error_reason=cancelled&tab=1',
      'https://app.example.es',
    );
    const parsed = new URL(cleaned);

    expect(parsed.searchParams.get('error')).toBeNull();
    expect(parsed.searchParams.get('error_reason')).toBeNull();
    expect(parsed.searchParams.get('tab')).toBe('1');
  });

  it('maps provider errors onto the contract taxonomy', () => {
    expect(mapCallbackError('loa_not_met')).toBe('loa_not_met');
    expect(mapCallbackError('tenant_mismatch')).toBe('tenant_mismatch');
    expect(mapCallbackError('cancelled')).toBe('federation_cancelled');
    expect(mapCallbackError('signature_invalid')).toBeNull();
    expect(mapCallbackError(null)).toBeNull();
  });

  it('exposes descriptors as capabilities and rejects password flows', async () => {
    const client = containerWith().get(AuthKitClient);

    expect(client.capabilities.federation).toHaveLength(2);
    expect(client.capabilities.password).toBe(false);

    const result = await client.signInWithPassword();
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('provider_disabled');
  });
});
