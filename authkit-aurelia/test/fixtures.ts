import type {
  AuthFederationMethod,
  AuthFederationProvider,
  AuthSession,
} from '../src/contract/auth.models';

export function method(
  id: string,
  overrides: Partial<AuthFederationMethod> = {},
): AuthFederationMethod {
  return {
    id,
    displayName: id,
    description: null,
    levels: ['substantial', 'high'],
    recommended: false,
    ...overrides,
  };
}

export function provider(
  id: string,
  overrides: Partial<AuthFederationProvider> = {},
): AuthFederationProvider {
  return {
    id,
    kind: 'clave',
    displayName: firstLetterUpper(id),
    description: null,
    iconUrl: null,
    methods: [method('clave_movil'), method('certificate')],
    levels: ['substantial', 'high'],
    isPrimary: false,
    ...overrides,
  };
}

function firstLetterUpper(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

export function session(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    accessToken: 'token-123',
    refreshToken: null,
    expiresAt: '2026-10-22T12:00:00.000Z',
    tokenType: 'Bearer',
    provider: {
      ref: 'clientes/clave',
      audience: 'clientes',
      providerId: 'clave',
      kind: 'clave',
      displayName: 'Cl@ve',
      origin: 'self_hosted',
      tenant: 'caib',
      capturedAt: '2026-10-22T11:00:00.000Z',
    },
    user: {
      id: 'subject-opaque',
      email: null,
      phone: null,
      emailConfirmedAt: null,
      phoneConfirmedAt: null,
      displayName: 'Maria Example',
      metadata: {},
      identity: {
        subject: 'subject-opaque',
        documentType: 'dni',
        documentId: '12345678Z',
        documentIdRaw: 'ES/ES/12345678Z',
        givenName: 'Maria',
        familyName: 'Example',
        dateOfBirth: '1990-01-31',
        level: 'high',
        method: 'clave_movil',
        tenant: 'caib',
        representedDocumentId: null,
        authenticatedAt: '2026-10-22T11:00:00.000Z',
      },
    },
    ...overrides,
  };
}
