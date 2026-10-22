# @authkit/aurelia

AuthKit for **Aurelia v1**. One plugin, one HTTP interceptor and one router pipeline step. It wires
the server-driven Cl@ve (eIDAS) federation into the Aurelia primitives an application already uses.

> **The browser never holds a token and never parses SAML.** The host server performs the whole
> federation, creates the session, and pushes the result to the browser. This package only builds
> the host's login URL and reads the `error` / `error_reason` the host put in the redirect.

## Install

```bash
npm install @authkit/aurelia
```

Peer dependencies: `aurelia-framework`, `aurelia-pal`, `aurelia-fetch-client` and `aurelia-router`
(v1.x). `reflect-metadata` is already loaded by real Aurelia applications through
`aurelia-polyfills`.

## Wiring

```ts
// main.ts
import { PLATFORM } from 'aurelia-pal';
import { HttpClient } from 'aurelia-fetch-client';
import { registerAuthKitHttpInterceptor } from '@authkit/aurelia';

export function configure(aurelia: Aurelia): void {
  aurelia.use.standardConfiguration().developmentLogging();

  aurelia.use.plugin(PLATFORM.moduleName('@authkit/aurelia'), (config) => {
    config.baseUrl = 'https://sede.example.es';
    config.audience = 'clients';
    config.providers = descriptors; // AuthFederationProvider[] from your server
    config.loginRoute = 'login';
  });

  // After the plugin is registered, attach the interceptor to the host's own client.
  registerAuthKitHttpInterceptor(aurelia.container.get(HttpClient), aurelia.container);
}
```

The plugin registers these singletons in Aurelia's own container:

| Token                    | What it is                                                                |
| ------------------------ | ------------------------------------------------------------------------- |
| `AuthKitConfig`          | validated plugin options                                                  |
| `AuthKitSession`         | plain session view (`session`, `user`, `loa`, `isAuthenticated`)          |
| `AuthKitClient`          | server-driven federation client (`beginFederation`, `completeFederation`) |
| `AuthKitHttpInterceptor` | bearer attachment and opt-out handling                                    |
| `AuthKitAuthorizeStep`   | router pipeline step                                                      |

### Router step

Register it once, in `app.ts`, using the documented v1 pipeline slot:

```ts
import { RouterConfiguration } from 'aurelia-router';
import { addAuthKitAuthorizeStep } from '@authkit/aurelia';

export class App {
  configureRouter(config: RouterConfiguration): void {
    addAuthKitAuthorizeStep(config);
    config.map([
      { route: 'login', name: 'login', moduleId: PLATFORM.moduleName('./login') },
      {
        route: 'expedientes/:id',
        name: 'expedientes',
        moduleId: PLATFORM.moduleName('./expedientes'),
        data: { authKit: { loa: 'high', audience: 'clients' } },
      },
    ]);
  }
}
```

The step reads `data.authKit` and, when the session is missing, belongs to another audience, or its
level is below the requirement, calls `next.cancel(new Redirect(url))`. `url` is
`loginRoute?returnUrl=…&reason=…`. Anonymous routes carry no `data.authKit` and are untouched.

### Session

v1 has no signals. Bind to plain properties and subscribe to `sessionChanged` when a component needs
to react:

```ts
import { AuthKitSession } from '@authkit/aurelia';
import { inject } from 'aurelia-framework';

@inject(AuthKitSession)
export class Shell {
  constructor(readonly auth: AuthKitSession) {}

  attached(): void {
    this.unsubscribe = this.auth.sessionChanged.subscribe(() => {
      // re-read this.auth.user / this.auth.loa
    });
  }

  detached(): void {
    this.unsubscribe();
  }
}
```

### Federation

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

if (!result.ok) {
  // result.error.code is one of the federation codes of contract 1.1.0
}
```

Success is inferred from the host session (`client.setSession(sessionFromServer)`). If the host has
no session after the redirect, the callback returns `identity_not_verified` — it never guesses.

### Rendering from descriptors

`client.providers` is the descriptor list the server sent. Render one button per provider and one
button per `provider.methods`, and a level selector only when `provider.levels.length > 1`. There is
no `switch` on provider id or method id anywhere in this package or in the host.

### HTTP interceptor

`AuthKitHttpInterceptor` attaches `Authorization: Bearer <token>` only when `session.accessToken`
exists, only to the `baseUrl` origin, and only when the request has no `Authorization` of its own. A
request that sends `X-AuthKit-Skip: 1` is left untouched and the marker is removed before sending.

## Tests

```bash
npm test
```

The suite uses the real `aurelia-dependency-injection` container and the real `HttpClient`; no DI
mocks. It covers singleton registration, session notifications, the six provider-resolution rules,
interceptor attach/skip behaviour and the `Redirect` produced by the authorize step.

## Notes and deviations

- **Interceptor scope.** The spec asks for a bearer interceptor; this implementation additionally
  restricts it to the configured origin, so a token can never leak to a third-party API (R-21).
- **`completeFederation` is synchronous** because it performs no network call, matching the 1.1.0
  operations table. `beginFederation` returns a `Promise<string>` because the contract declares it
  async.
- **`npm test` mirrors the package into a temporary directory when the checkout path contains `#`,
  `?` or `%`.** Vite/Vitest interprets `#` as a URL fragment and cannot load test files from a path
  such as `.../Dev/C#/AuthKit`. On a normal path Vitest runs in place, unchanged. The wrapper is
  `scripts/run-vitest.mjs`.
- Aurelia v1 resolves constructor metadata through `reflect-metadata`. The tests load it in
  `test/setup.ts`; applications already have it via `aurelia-polyfills`.
