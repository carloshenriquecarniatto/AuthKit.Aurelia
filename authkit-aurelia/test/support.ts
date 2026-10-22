import type { NavigationInstruction, Next } from 'aurelia-router';
import type { AuthAssuranceLevel } from '../src/contract/auth.models';

/** The shape a route may declare under `data.authKit`. */
export interface AuthRouteRequirementData {
  readonly loa?: AuthAssuranceLevel | null;
  readonly audience?: string | null;
  readonly providerRef?: string | null;
}

export interface PipelineCall {
  readonly kind: 'next' | 'complete' | 'cancel' | 'reject';
  readonly output?: unknown;
}

/**
 * A minimal, real implementation of the `Next` pipeline callback: it records
 * what the step did, which is exactly the contract the router consumes.
 */
export function pipelineNext(): { next: Next; calls: PipelineCall[] } {
  const calls: PipelineCall[] = [];

  const record = (kind: PipelineCall['kind'], output?: unknown): Promise<unknown> => {
    calls.push({ kind, output });
    return Promise.resolve(undefined);
  };

  const next = Object.assign(() => record('next'), {
    complete: (output?: unknown) => record('complete', output),
    cancel: (output?: unknown) => record('cancel', output),
    reject: (output?: unknown) => record('reject', output),
  });

  return { next: next as unknown as Next, calls };
}

export function instructionFor(
  fragment: string,
  data: AuthRouteRequirementData | null,
): NavigationInstruction {
  return {
    fragment,
    config: { data: data === null ? {} : { authKit: data } },
  } as unknown as NavigationInstruction;
}
