import { describe, expect, it } from 'vitest';
import { Container } from 'aurelia-dependency-injection';
import { Redirect } from 'aurelia-router';
import {
  AuthKitAuthorizeStep,
  AuthKitSession,
  configure,
  hasLevel,
  readAuthKitRequirement,
} from '../src/index';
import type { AuthRouteRequirementData } from './support';
import { instructionFor, pipelineNext } from './support';
import { provider, session } from './fixtures';

function stepFor(
  signedIn: boolean,
  level: 'low' | 'substantial' | 'high' = 'high',
): AuthKitAuthorizeStep {
  const container = new Container();
  configure({ container }, (config) => {
    config.baseUrl = 'https://auth.example.es';
    config.audience = 'clientes';
    config.loginRoute = 'login';
    config.providers = [provider('clave', { displayName: 'Cl@ve', isPrimary: true })];
  });

  if (signedIn) {
    const value = session();
    container.get(AuthKitSession).setSession({
      ...value,
      user: {
        ...value.user,
        identity: value.user.identity === null ? null : { ...value.user.identity, level },
      },
    });
  }

  return container.get(AuthKitAuthorizeStep);
}

async function run(
  step: AuthKitAuthorizeStep,
  data: AuthRouteRequirementData | null,
  fragment = 'expedientes/7',
): Promise<{ kinds: string[]; redirect: Redirect | null }> {
  const harness = pipelineNext();
  const instruction = instructionFor(fragment, data);

  await step.run(instruction, harness.next);

  const cancelCall = harness.calls.find((call) => call.kind === 'cancel');
  return {
    kinds: harness.calls.map((call) => call.kind),
    redirect: cancelCall?.output instanceof Redirect ? cancelCall.output : null,
  };
}

describe('AuthKitAuthorizeStep', () => {
  it('lets an unprotected route through', async () => {
    const result = await run(stepFor(false), null);
    expect(result.kinds).toEqual(['next']);
  });

  it('cancels navigation with a Redirect to the login route', async () => {
    const result = await run(stepFor(false), { loa: 'high' });

    expect(result.kinds).toEqual(['cancel']);
    expect(result.redirect).toBeInstanceOf(Redirect);
    expect(result.redirect?.url).toContain('login?');
    expect(result.redirect?.url).toContain('returnUrl=expedientes%2F7');
    expect(result.redirect?.url).toContain('reason=authentication_required');
  });

  it('allows an authenticated session whose level is sufficient', async () => {
    const result = await run(stepFor(true, 'high'), { loa: 'substantial', audience: 'clientes' });
    expect(result.kinds).toEqual(['next']);
  });

  it('fails closed when the level is below the route requirement', async () => {
    const result = await run(stepFor(true, 'low'), { loa: 'high' });

    expect(result.kinds).toEqual(['cancel']);
    expect(result.redirect?.url).toContain('reason=loa_not_met');
  });

  it('fails when the session belongs to another audience', async () => {
    const result = await run(stepFor(true, 'high'), { audience: 'intranet' });

    expect(result.kinds).toEqual(['cancel']);
    expect(result.redirect?.url).toContain('reason=audience_mismatch');
  });

  it('fails when the session belongs to another provider ref', async () => {
    const result = await run(stepFor(true, 'high'), { providerRef: 'clientes/certificate' });

    expect(result.kinds).toEqual(['cancel']);
    expect(result.redirect?.url).toContain('reason=audience_mismatch');
  });

  it('does not cancel a navigation that is already heading to the login route', async () => {
    const result = await run(stepFor(false), { loa: 'high' }, 'login');
    expect(result.kinds).toEqual(['next']);
  });

  it('reads data without trusting its shape', () => {
    expect(readAuthKitRequirement(null)).toBeNull();
    expect(readAuthKitRequirement({ authKit: 'high' })).toBeNull();
    expect(readAuthKitRequirement({ authKit: { loa: 'extreme' } })).toEqual({
      loa: null,
      audience: null,
      providerRef: null,
    });
    expect(readAuthKitRequirement({ authKit: { loa: 'high', audience: ' clientes ' } })).toEqual({
      loa: 'high',
      audience: 'clientes',
      providerRef: null,
    });
  });

  it('never treats an absent level as sufficient', () => {
    expect(hasLevel(null, 'low')).toBe(false);
    expect(hasLevel('low', 'low')).toBe(true);
    expect(hasLevel('high', null)).toBe(true);
  });
});
