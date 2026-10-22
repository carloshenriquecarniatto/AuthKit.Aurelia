import type { Interceptor } from 'aurelia-fetch-client';
import { AuthKitConfig } from './authkit-config';
import { AuthKitSession } from './authkit-session';

/**
 * Per-request opt-out. A host that needs to call an endpoint without the bearer
 * token adds `X-AuthKit-Skip: 1`; the interceptor removes the marker before the
 * request leaves the browser.
 */
export const AUTHKIT_SKIP_HEADER = 'X-AuthKit-Skip';

type HeaderBag = Headers | Record<string, string>;

function isHeaders(headers: HeaderBag): headers is Headers {
  return typeof (headers as Headers).get === 'function';
}

function readHeader(headers: HeaderBag, name: string): string | null {
  if (isHeaders(headers)) {
    return headers.get(name);
  }
  const key = Object.keys(headers).find((entry) => entry.toLowerCase() === name.toLowerCase());
  return key === undefined ? null : (headers[key] ?? null);
}

function setHeader(headers: HeaderBag, name: string, value: string): void {
  if (isHeaders(headers)) {
    headers.set(name, value);
    return;
  }
  headers[name] = value;
}

function deleteHeader(headers: HeaderBag, name: string): void {
  if (isHeaders(headers)) {
    headers.delete(name);
    return;
  }
  const key = Object.keys(headers).find((entry) => entry.toLowerCase() === name.toLowerCase());
  if (key !== undefined) {
    delete headers[key];
  }
}

/**
 * Attaches `Authorization: Bearer <token>` when the session has a token.
 *
 * Two rules keep the header from leaking:
 * - the request must target the configured `baseUrl` origin (R-21);
 * - a request carrying the skip header, or an `Authorization` of its own, is
 *   left untouched.
 */
export class AuthKitHttpInterceptor implements Interceptor {
  static inject = [AuthKitConfig, AuthKitSession];

  private readonly allowedOrigin: string;

  constructor(
    private readonly config: AuthKitConfig,
    private readonly authSession: AuthKitSession,
  ) {
    this.allowedOrigin = new URL(config.baseUrl).origin;
  }

  request(request: Request): Request {
    const headers = request.headers as HeaderBag;

    if (readHeader(headers, AUTHKIT_SKIP_HEADER) !== null) {
      deleteHeader(headers, AUTHKIT_SKIP_HEADER);
      return request;
    }

    if (readHeader(headers, 'Authorization') !== null) {
      return request;
    }

    const token = this.authSession.session?.accessToken;
    if (token === undefined || token.length === 0) {
      return request;
    }

    if (!this.isSameOrigin(request.url)) {
      return request;
    }

    setHeader(headers, 'Authorization', `Bearer ${token}`);
    return request;
  }

  private isSameOrigin(url: string): boolean {
    try {
      return new URL(url, this.config.baseUrl).origin === this.allowedOrigin;
    } catch {
      return false;
    }
  }
}
