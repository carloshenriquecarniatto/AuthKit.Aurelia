import { describe, expect, it } from 'vitest';
import {
  AuthProviderResolutionError,
  formatProviderRef,
  parseProviderRef,
  resolveProvider,
  satisfiesLoa,
  validateProviders,
  type AuthProviderRegistration,
} from '../src/index';
import { provider } from './fixtures';

const clave = provider('clave', { displayName: 'Cl@ve', isPrimary: true });
const supabase = provider('supabase', { displayName: 'Supabase' });
const entra = provider('entra', { displayName: 'Entra', isPrimary: true });
const wallet = provider('wallet', { displayName: 'Wallet', isPrimary: true });
const backup = provider('backup', { displayName: 'Backup', isPrimary: true });

const registry: readonly AuthProviderRegistration[] = [
  { audience: 'clientes', provider: clave },
  { audience: 'clientes', provider: supabase },
  { audience: 'intranet', provider: entra },
  { audience: 'socios', provider: wallet },
  { audience: 'legacy', provider: backup },
];

describe('provider ref parsing', () => {
  it('parses and formats the canonical form', () => {
    const ref = parseProviderRef('clientes/clave');
    expect(ref).toEqual({ audience: 'clientes', providerId: 'clave' });
    expect(formatProviderRef(ref)).toBe('clientes/clave');
  });

  it('rejects malformed refs', () => {
    expect(() => parseProviderRef('clave')).toThrow(AuthProviderResolutionError);
    expect(() => parseProviderRef('clientes/clave/extra')).toThrow(/audience\/providerId/);
    expect(() => parseProviderRef('Clientes/clave')).toThrow(/must match/);
    expect(() => parseProviderRef('clientes/clave!')).toThrow(/must match/);
  });
});

describe('resolveProvider — spec-providers §3', () => {
  it('rule 1: an explicit providerRef wins over the audience', () => {
    const resolved = resolveProvider(registry, {
      providerRef: 'clientes/supabase',
      audience: 'clientes',
    });
    expect(resolved.id).toBe('supabase');
  });

  it('rule 1: an explicit providerId wins inside the audience', () => {
    expect(resolveProvider(registry, { providerId: 'supabase', audience: 'clientes' }).id).toBe(
      'supabase',
    );
  });

  it('rule 1: a providerId present in two audiences is ambiguous without a scope', () => {
    const duplicated = [...registry, { audience: 'socios', provider: clave }];
    expect(() => resolveProvider(duplicated, { providerId: 'clave' })).toThrow(
      /exists in 2 audiences/,
    );
  });

  it('rule 2: the audience selects its primary provider', () => {
    expect(resolveProvider(registry, { audience: 'clientes' }).id).toBe('clave');
    expect(resolveProvider(registry, { audience: 'intranet' }).id).toBe('entra');
  });

  it('rule 3: the primary provider wins when several are registered', () => {
    const withSecondPrimaryFree = [...registry];
    expect(resolveProvider(withSecondPrimaryFree, { audience: 'clientes' }).id).toBe('clave');
  });

  it('rule 4: a single-provider audience is unambiguous even without a primary', () => {
    const single = [{ audience: 'socios', provider: provider('only', { displayName: 'Only' }) }];
    expect(resolveProvider(single, { audience: 'socios' }).id).toBe('only');
  });

  it('rule 5: several providers and no primary fails with provider_ambiguous', () => {
    const noPrimary = [
      { audience: 'clientes', provider: provider('a', { displayName: 'A' }) },
      { audience: 'clientes', provider: provider('b', { displayName: 'B' }) },
    ];

    try {
      resolveProvider(noPrimary, { audience: 'clientes' });
      expect.unreachable('resolution should fail');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthProviderResolutionError);
      expect((error as AuthProviderResolutionError).code).toBe('provider_ambiguous');
    }
  });

  it('rule 6: resolution never crosses an audience boundary', () => {
    expect(() => resolveProvider(registry, { audience: 'unknown' })).toThrow(
      /no registered provider/,
    );
    expect(() =>
      resolveProvider(registry, { providerRef: 'intranet/entra', audience: 'clientes' }),
    ).toThrow(/does not belong to audience/);
    expect(() => resolveProvider(registry, { providerId: 'entra', audience: 'clientes' })).toThrow(
      /not registered in audience/,
    );
  });

  it('falls back to the reserved default audience or a single registration', () => {
    const defaulted = [{ audience: 'default', provider: provider('only') }];
    expect(resolveProvider(defaulted).id).toBe('only');

    const one = [{ audience: 'intranet', provider: entra }];
    expect(resolveProvider(one).id).toBe('entra');

    expect(() => resolveProvider(registry)).toThrow(/No audience was given/);
  });
});

describe('startup validation', () => {
  it('rejects duplicate ids and duplicate display names', () => {
    expect(() =>
      validateProviders([provider('a'), provider('a', { displayName: 'B' })], 'clientes'),
    ).toThrow(/registered twice/);

    expect(() =>
      validateProviders(
        [provider('a', { displayName: 'Same' }), provider('b', { displayName: 'Same' })],
        'clientes',
      ),
    ).toThrow(/Display name/);
  });

  it('rejects two primaries and a multi-provider audience without one', () => {
    expect(() =>
      validateProviders(
        [provider('a', { isPrimary: true }), provider('b', { displayName: 'B', isPrimary: true })],
        'clientes',
      ),
    ).toThrow(/2 primary providers/);

    expect(() =>
      validateProviders([provider('a'), provider('b', { displayName: 'B' })], 'clientes'),
    ).toThrow(/none is primary/);
  });
});

describe('LoA comparison', () => {
  it('orders low < substantial < high and fails closed when absent', () => {
    expect(satisfiesLoa('high', 'substantial')).toBe(true);
    expect(satisfiesLoa('substantial', 'high')).toBe(false);
    expect(satisfiesLoa(null, 'low')).toBe(false);
    expect(satisfiesLoa('low', null)).toBe(true);
    expect(satisfiesLoa('unknown', 'low')).toBe(false);
  });
});
