// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Aurelia, DI, IObserverLocator } from 'aurelia';
import {
  AuthKitConfiguration,
  AuthKitSessionStore,
  IAuthKitClient,
  callbackUrlWithoutOutcome,
  mapCallbackError,
} from '../src/index';
import type { AuthSession } from '../src/contract/auth.models';
import { provider, session } from './fixtures';

function container(): ReturnType<typeof DI.createContainer> {
  const instance = DI.createContainer();
  instance.register(
    AuthKitConfiguration.customize({
      baseUrl: 'https://auth.example.es',
      audience: 'clientes',
      loginPath: '/clave/login',
      loginRoute: 'login',
      providers: [
        provider('clave', { displayName: 'Cl@ve', isPrimary: true }),
        provider('certificate', { displayName: 'Certificate' }),
      ],
    }),
  );
  return instance;
}

describe('IAuthKitClient', () => {
  it('notifies through Aurelia @observable / IObserverLocator', () => {
    const client = container().get(IAuthKitClient);
    const locator = new Aurelia().container.get(IObserverLocator);
    const observer = locator.getObserver(client, 'session');
    const seen: Array<AuthSession | null> = [];

    observer.subscribe({ handleChange: () => seen.push(client.session) });
    client.setSession(session());

    expect(seen).toHaveLength(1);
    expect(seen[0]?.user.id).toBe('subject-opaque');

    client.setSession(null);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBeNull();
  });

  it('also exposes a plain subscription for non-Aurelia consumers', () => {
    const client = container().get(IAuthKitClient);
    const seen: Array<AuthSession | null> = [];
    const unsubscribe = client.onSessionChanged((value) => seen.push(value));

    client.setSession(session());
    unsubscribe();
    client.setSession(null);

    expect(seen).toHaveLength(1);
    expect(client.isAuthenticated).toBe(false);
  });

  it('exposes the session, user and LoA surface', () => {
    const client = container().get(IAuthKitClient);
    client.setSession(session());

    expect(client.session?.provider?.ref).toBe('clientes/clave');
    expect(client.user?.displayName).toBe('Maria Example');
    expect(client.loa).toBe('high');
    expect(client.isAuthenticated).toBe(true);
    expect(client.capabilities.federation).toHaveLength(2);
    expect(client.capabilities.password).toBe(false);
  });

  it('keeps the non-federation surface fail-closed', async () => {
    const client = container().get(IAuthKitClient);

    const password = await client.signInWithPassword('person@example.es', 'secret');
    expect(password.ok).toBe(false);
    expect(password.error?.code).toBe('provider_disabled');

    const oauth = await client.completeOAuth('https://app.example.es/cb');
    expect(oauth.error?.code).toBe('provider_disabled');
  });

  it('keeps sessions keyed by provider ref in the store', async () => {
    const instance = container();
    const client = instance.get(IAuthKitClient);
    const store = instance.get(AuthKitSessionStore);

    client.setSession(session());
    expect(store.get('clientes/clave')?.user.id).toBe('subject-opaque');
    expect(store.size).toBe(1);

    const staff = session({
      provider: {
        ref: 'intranet/entra-staff',
        audience: 'intranet',
        providerId: 'entra-staff',
        kind: 'entra',
        displayName: 'Entra',
        origin: 'third_party',
        tenant: null,
        capturedAt: '2026-10-22T11:00:00.000Z',
      },
    });
    store.put('intranet/entra-staff', staff);

    await client.signOut();
    expect(store.get('clientes/clave')).toBeNull();
    expect(store.get('intranet/entra-staff')).toBe(staff);
    expect(client.session).toBeNull();
  });

  it('builds the host login URL without navigating', async () => {
    const client = container().get(IAuthKitClient);

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
  });

  it('rejects unknown providers and unsupported levels or methods', async () => {
    const client = container().get(IAuthKitClient);

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
    const client = container().get(IAuthKitClient);

    expect(
      client.completeFederation(
        'https://app.example.es/callback?error=access_denied&error_reason=cancelled',
      ).error?.code,
    ).toBe('federation_cancelled');

    expect(
      client.completeFederation('https://app.example.es/callback?error_reason=tenant_mismatch')
        .error?.code,
    ).toBe('tenant_mismatch');

    expect(
      client.completeFederation(
        'https://app.example.es/callback?error=invalid_request&error_reason=signature_invalid',
      ).error?.code,
    ).toBe('federation_failed');

    expect(client.completeFederation('https://app.example.es/expedientes').error?.code).toBe(
      'identity_not_verified',
    );

    client.setSession(session());
    const success = client.completeFederation('https://app.example.es/expedientes');
    expect(success.ok).toBe(true);
    expect(success.session?.user.identity?.level).toBe('high');
  });

  it('strips outcome parameters and maps the error taxonomy', () => {
    const cleaned = new URL(
      callbackUrlWithoutOutcome(
        'https://app.example.es/cb?error=access_denied&error_reason=cancelled&tab=1',
        'https://app.example.es',
      ),
    );

    expect(cleaned.searchParams.get('error')).toBeNull();
    expect(cleaned.searchParams.get('error_reason')).toBeNull();
    expect(cleaned.searchParams.get('tab')).toBe('1');

    expect(mapCallbackError('loa_not_met')).toBe('loa_not_met');
    expect(mapCallbackError('cancelled')).toBe('federation_cancelled');
    expect(mapCallbackError('signature_invalid')).toBeNull();
  });
});
