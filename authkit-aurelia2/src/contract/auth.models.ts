/**
 * The normative contract lives in `@authkit/contracts`, shared with the Angular SDK.
 * This module re-exports it so the plugin's imports stay local.
 */

export type {
  AuthAssuranceLevel,
  AuthCapabilities,
  AuthDocumentType,
  AuthError,
  AuthErrorCode,
  AuthFederationMethod,
  AuthFederationProvider,
  AuthIdentity,
  AuthMessageKey,
  AuthNextStep,
  AuthProviderRef,
  AuthProviderSnapshot,
  AuthResult,
  AuthSession,
  AuthState,
  AuthTheme,
  AuthUser,
} from '@authkit/contracts';

export { authError, fail, next, ok } from '@authkit/contracts';
