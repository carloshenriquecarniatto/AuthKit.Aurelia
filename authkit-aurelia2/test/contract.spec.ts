import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { AUTHKIT_CONTRACT } from '../src/contract/auth.models';

/**
 * Guards `contracts/authkit.contract.json`, which is copied from AuthKit.Net. CI downloads the
 * canonical file and fails if the copy drifts; this test fails if the TypeScript declarations drift
 * from the copy.
 */
function loadContract(): any {
  let directory = process.cwd();

  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = join(directory, 'contracts', 'authkit.contract.json');
    if (existsSync(candidate)) {
      return JSON.parse(readFileSync(candidate, 'utf8'));
    }
    directory = dirname(directory);
  }

  throw new Error('contracts/authkit.contract.json was not found from the test working directory.');
}

describe('AuthKit contract parity', () => {
  const contract = loadContract();

  it('declares the same contract version', () => {
    expect(contract.contractVersion).toBe(AUTHKIT_CONTRACT.contractVersion);
  });

  it('declares the same types and fields as the TypeScript SDK', () => {
    const declared = Object.keys(contract.types)
      .filter((name) => contract.types[name].fields !== undefined)
      .sort();

    expect(declared.sort()).toEqual(Object.keys(AUTHKIT_CONTRACT.types).sort());

    for (const typeName of declared) {
      const expected = Object.keys(contract.types[typeName].fields).sort();
      const actual = [...AUTHKIT_CONTRACT.types[typeName]].sort();
      expect(actual, `${typeName} fields`).toEqual(expected);
    }
  });

  it('declares the same enum values', () => {
    expect(contract.types.AuthErrorCode.enum).toEqual([...AUTHKIT_CONTRACT.errorCodes]);
    expect(contract.types.AuthState.enum).toEqual([...AUTHKIT_CONTRACT.states]);
    expect(contract.types.AuthNextStep.enum).toEqual([...AUTHKIT_CONTRACT.nextSteps]);
    expect(contract.types.AuthMessageKey.enum).toEqual([...AUTHKIT_CONTRACT.messageKeys]);
  });

  it('declares the same operations', () => {
    expect(contract.operations.map((operation: { name: string }) => operation.name)).toEqual([
      ...AUTHKIT_CONTRACT.operations,
    ]);
  });
});
