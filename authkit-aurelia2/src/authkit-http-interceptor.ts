import type { IFetchInterceptor } from '@aurelia/fetch-client';
import { IHttpClient } from '@aurelia/fetch-client';
import type { IContainer } from 'aurelia';
import { AuthKitConfig } from './authkit-config';
import { IAuthKitClient } from './authkit-client';

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
 * Aurelia v2 fetch interceptor: attaches `Authorization: Bearer` only when the
 * session carries a token, only to the configured origin, and never over an
 * opt-out request (spec-host-integration §6, R-21).
 */
export class AuthKitHttpInterceptor implements IFetchInterceptor {
  static inject = [AuthKitConfig, IAuthKitClient];

  private readonly allowedOrigin: string;

  constructor(
    private readonly config: AuthKitConfig,
    private readonly client: IAuthKitClient,
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

    const token = this.client.session?.accessToken;
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

/**
 * Wires the interceptor into the host's own `IHttpClient` with
 * `withInterceptor`. Register it after your HttpClient registration:
 *
 * ```ts
 * Aurelia.register(HttpClient, AuthKitConfiguration.customize(...), AuthKitHttpClient)
 * ```
 */
export const AuthKitHttpClient = {
  register(container: IContainer): void {
    registerAuthKitHttpInterceptor(container);
  },
};

export function registerAuthKitHttpInterceptor(container: IContainer): AuthKitHttpInterceptor {
  const http = container.get(IHttpClient);
  const interceptor = container.get(AuthKitHttpInterceptor);

  http.configure((config) => {
    config.withInterceptor(interceptor);
  });

  return interceptor;
}
