import type { INavigationOptions, Params, RouteNode } from '@aurelia/router';
import type { AuthAssuranceLevel } from '../src/contract/auth.models';

export interface RouteData {
  readonly authKit?: {
    readonly loa?: AuthAssuranceLevel | null;
    readonly audience?: string | null;
    readonly providerRef?: string | null;
  };
}

/** A RouteNode-shaped value carrying only what the guard reads. */
export function routeNode(data: RouteData, path = 'expedientes/7'): RouteNode {
  return {
    path,
    finalPath: path,
    data,
  } as unknown as RouteNode;
}

export const navigationParams: Params = {};
export const navigationOptions: INavigationOptions = {};
