# AuthKit for Aurelia

Two packages, one contract. This repository ships the Aurelia SDK only; the other platforms live in
their own repositories:

| Platform | Repository                                                                    |
| -------- | ----------------------------------------------------------------------------- |
| .NET     | [AuthKit.Net](https://github.com/carloshenriquecarniatto/AuthKit.Net)         |
| Angular  | [AuthKit.Angular](https://github.com/carloshenriquecarniatto/AuthKit.Angular) |
| Contract | [`@authkit/contracts`](https://www.npmjs.com/package/@authkit/contracts)      |

```bash
npm install @authkit/aurelia @authkit/contracts    # Aurelia v1
npm install @authkit/aurelia2 @authkit/contracts   # Aurelia v2
```

|                 | [`authkit-aurelia`](authkit-aurelia)                                   | [`authkit-aurelia2`](authkit-aurelia2)                                            |
| --------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Framework       | Aurelia v1 (`aurelia-framework@1.4.1`)                                 | Aurelia v2 (`aurelia@2.0.0-rc.2`)                                                 |
| Package         | `@authkit/aurelia`                                                     | `@authkit/aurelia2`                                                               |
| Entry point     | plugin `configure(aurelia, callback)`                                  | `AuthKitConfiguration.customize({...})` registered with `Aurelia.register`        |
| DI              | `container.registerSingleton`                                          | `IContainer` + `Registration.singleton`                                           |
| Session surface | plain properties + `sessionChanged.subscribe(...)`                     | `@observable session` + plain `onSessionChanged(...)`                             |
| HTTP            | `Interceptor` added with `http.configure(c => c.withInterceptor(...))` | `IFetchInterceptor` added with `withInterceptor` through `AuthKitHttpClient`      |
| Router          | `config.addPipelineStep('authorize', AuthKitAuthorizeStep)`            | component `canLoad = resolve(IAuthKitRouteGuard).canLoad` (rc.2 has no `addHook`) |
| Failure shape   | `next.cancel(new Redirect(url))`                                       | returns the login URL string from `canLoad`                                       |
| Tests           | real `Container`                                                       | real `DI.createContainer()`                                                       |

`authkit-aurelia2/README.md` documents the router deviation: `@aurelia/router@2.0.0-rc.2` declares
no `IRouter.addHook`, so the route-level `canLoad` helper allowed by `spec-host-integration.md` open
question 4 is what ships.

## Two rules that never change

1. **AuthKit never navigates.** `beginFederation(...)` returns the host's login URL;
   `completeFederation(...)` returns a result; the router step returns a `Redirect` or a URL string.
   The host decides when the browser moves.
2. **The browser never holds a token and never parses SAML.** Cl@ve is server-driven: the pasarela
   posts the assertion to the host, the host validates it and creates the session. The browser
   package has no XML dependency, no signing capability and no token exchange. `completeFederation`
   reads only `error` / `error_reason` and treats the host session as the source of truth.

The bearer interceptor exists for hosts that mint their own JWTs (see `spec-host-integration.md`
§7). It attaches a token only for the configured origin and only when a token is present in the
session.

## Descriptors drive the UI

Both packages expose the same `AuthFederationProvider[]` (`client.providers`). A screen renders:

- one button per provider, from `displayName` / `description` / `iconUrl`;
- one button per `provider.methods` entry, from its own `displayName`, `description`, `levels` and
  `recommended` flag;
- a level selector only when `provider.levels.length > 1`.

Labels, ordering, descriptions and the recommended default arrive as data. There is no `switch` on a
provider id or a method id in either package, and hosts should not add one (R-16).

## Provider routing (both packages)

`resolveProvider` implements the six ordered rules of `spec-providers.md` §3:

1. explicit `providerRef` (`audience/id`) or `providerId` wins;
2. otherwise the audience in scope;
3. otherwise the audience's `isPrimary` provider;
4. otherwise the only provider in the audience;
5. otherwise `provider_ambiguous` — never first-registered, never guessed;
6. resolution never crosses an audience boundary.

Registration-time validation rejects duplicate ids, duplicate display names within an audience, more
than one primary, or several providers without a primary.

## Commands

```bash
cd authkit-aurelia  && npm test && npx tsc -p tsconfig.json --noEmit
cd authkit-aurelia2 && npm test && npx tsc -p tsconfig.json --noEmit
```

When the checkout path contains `#` (for example `.../Dev/C#/AuthKit`), `npm test` mirrors the
package into a temporary directory before running Vitest, because Vite treats `#` as a URL fragment.
That workaround is internal to `scripts/run-vitest.mjs` and is skipped on normal paths.
