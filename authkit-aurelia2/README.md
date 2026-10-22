# @authkit/aurelia2

AuthKit for **Aurelia v2** (`2.0.0-rc.2`). It registers the server-driven Cl@ve (eIDAS) federation
through Aurelia's own primitives: `IContainer` + `Registration.singleton`, an `IHttpClient`
interceptor, an observable session and a route guard.

> **The browser never holds a token and never parses SAML.** The host server performs the whole
> federation and owns the session. This package builds the host's login URL and reads the `error` /
> `error_reason` the host put in the redirect.

## Install

```bash
npm install @authkit/aurelia2
```

Peer dependencies: `aurelia@^2.0.0-rc.2` and `@aurelia/fetch-client`. `@aurelia/router` is an
**optional** peer: only the `canLoad` guard typings use it.

## Wiring

```ts
import Aurelia from 'aurelia';
import { HttpClient } from '@aurelia/fetch-client';
import { AuthKitConfiguration, AuthKitHttpClient } from '@authkit/aurelia2';
import { MyApp } from './my-app';

Aurelia.register(
  HttpClient,
  AuthKitConfiguration.customize({
    baseUrl: 'https://sede.example.es',
    loginPath: '/clave/login',
    audience: 'clients',
    providers: descriptors, // AuthFederationProvider[] from your server
    loginRoute: 'login',
  }),
  AuthKitHttpClient, // wires AuthKitHttpInterceptor with withInterceptor
)
  .app(MyApp)
  .start();
```

`AuthKitConfiguration.customize(...)` validates the options once and registers, as singletons via
`IContainer` and `Registration.singleton`:

| Token                    | Implementation                    |
| ------------------------ | --------------------------------- |
| `AuthKitConfig`          | validated immutable configuration |
| `AuthKitSessionStore`    | keyed in-memory sessions (by ref) |
| `IAuthKitClient`         | `AuthKitClient`                   |
| `AuthKitHttpInterceptor` | fetch interceptor                 |
| `IAuthKitRouteGuard`     | `AuthKitRouteGuard`               |

`AuthKitHttpClient` is a separate registry so the host controls when the interceptor is attached.
Registering it before `HttpClient` is a configuration error, by design.

## Session

`AuthKitClient.session` is decorated with Aurelia's `@observable`; template bindings and
`IObserverLocator` consumers update automatically. For code outside Aurelia, use the plain listener:

```ts
import { resolve } from 'aurelia';
import { IAuthKitClient } from '@authkit/aurelia2';

export class Shell {
  private readonly auth = resolve(IAuthKitClient);

  readonly unsubscribe = this.auth.onSessionChanged((session) => {
    // session is null after sign-out
  });
}
```

`user`, `loa` and `isAuthenticated` are derived getters. Sessions are also kept in
`AuthKitSessionStore`, keyed by the canonical provider ref (`clients/clave`), so two providers can
coexist without being merged.

## Federation

```ts
const url = await client.beginFederation('clients/clave', 'high', 'clave_movil', '/expedientes');

// The host navigates. AuthKit never does.
window.location.assign(url);
```

On the callback page:

```ts
const result = client.completeFederation(window.location.href);
window.history.replaceState(
  {},
  '',
  callbackUrlWithoutOutcome(window.location.href, 'https://sede.example.es'),
);
```

`completeFederation` performs no network call and no token exchange. Success is inferred from the
session the host already created; with no session it returns `identity_not_verified`.

## Router integration — rc.2 has no `IRouter.addHook`

The specification (`spec-host-integration.md` §5.2) asks for an `IRouter.addHook` router hook.
**`@aurelia/router@2.0.0-rc.2` does not expose it**: `IRouter` extends `Router` and that class only
offers `load`, `generatePath` and `updateTitle`. The declared guard is a component lifecycle hook,
`canLoad(params, next, current, options)`.

The supported fallback is therefore a route-level `canLoad` the host adds explicitly:

```ts
import { resolve } from 'aurelia';
import { IAuthKitRouteGuard } from '@authkit/aurelia2';

export class Expedientes {
  // The arrow function keeps `this` bound to the guard.
  canLoad = resolve(IAuthKitRouteGuard).canLoad;
}
```

The route declares its requirement in `data`:

```ts
{
  path: 'expedientes/:id',
  component: Expedientes,
  data: { authKit: { loa: 'high', audience: 'clients' } },
}
```

`canLoad` returns `true`, or the login URL string (`login?returnUrl=…&reason=…`), which the router
treats as a redirect instruction. The guard itself never calls the router. When a future rc exposes
`addHook`, the same decision function (`decideAuthKitNavigation`) can back that hook without
changing the rules.

## Rendering from descriptors

`client.providers` is the descriptor list from the server. Render `displayName`, `description`,
`iconUrl`, `levels` and one control per `methods` entry. No `switch` on provider id or method id is
needed or allowed.

## Interceptor

`AuthKitHttpInterceptor` attaches `Authorization: Bearer <token>` only when the session has a token,
only for the configured origin, and never over an existing `Authorization`. A request carrying
`X-AuthKit-Skip: 1` is left untouched and the marker is stripped before sending.

## Tests

```bash
npm test
```

The suite uses the real `DI.createContainer()`, the real `HttpClient`, and the real Aurelia
`IObserverLocator`; no DI mocks. It covers singleton resolution, `@observable` notification, the
interceptor registration and attach/skip rules, and every guard decision (anonymous, sufficient
level, LoA downgrade, audience/provider mismatch, login-route loop).

## Notes and deviations

- **Router hook.** `IRouter.addHook` does not exist in `aurelia@2.0.0-rc.2` /
  `@aurelia/router@2.0.0-rc.2`. The route-level `canLoad` fallback permitted by open question 4 is
  implemented and documented above.
- **Interceptor scope.** Attaching only to the configured origin is an intentional hardening of
  R-21.
- **`npm test` mirrors the package into a temporary directory when the checkout path contains `#`,
  `?` or `%`**, because Vite treats `#` as a URL fragment and cannot load tests from
  `.../Dev/C#/AuthKit`. On a normal path Vitest runs in place.
- `jsdom` is a dev dependency of the tests only: the Aurelia `@observable` observer locator needs a
  DOM `Node` global. The package itself is platform-neutral.
