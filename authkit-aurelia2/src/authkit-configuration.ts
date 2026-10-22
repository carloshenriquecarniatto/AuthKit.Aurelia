import { Registration, type IContainer, type IRegistry } from 'aurelia';
import { AuthKitClient, IAuthKitClient } from './authkit-client';
import { AuthKitConfig, type AuthKitOptions } from './authkit-config';
import { AuthKitHttpInterceptor } from './authkit-http-interceptor';
import { AuthKitRouteGuard, IAuthKitRouteGuard } from './authkit-router-hook';
import { AuthKitSessionStore } from './authkit-session-store';

/**
 * The single registration entry point:
 *
 * ```ts
 * Aurelia.register(
 *   AuthKitConfiguration.customize({
 *     baseUrl: 'https://auth.example.es',
 *     audience: 'clients',
 *     providers: descriptors,
 *   }),
 * )
 *   .app(MyApp)
 *   .start();
 * ```
 *
 * Every service is a singleton in Aurelia's own container. The configuration
 * itself is registered as an instance, because it is validated before the app
 * starts.
 */
export class AuthKitConfiguration {
  static customize(options: AuthKitOptions): IRegistry {
    const config = new AuthKitConfig(options);

    return {
      register(container: IContainer): IContainer {
        container.register(
          Registration.instance(AuthKitConfig, config),
          Registration.singleton(AuthKitSessionStore, AuthKitSessionStore),
          Registration.singleton(IAuthKitClient, AuthKitClient),
          Registration.singleton(AuthKitHttpInterceptor, AuthKitHttpInterceptor),
          Registration.singleton(IAuthKitRouteGuard, AuthKitRouteGuard),
        );
        return container;
      },
    };
  }
}
