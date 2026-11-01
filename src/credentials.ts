/** Read one GitHub credential reference through DSH's optional Host service, never the file itself. */
import { UpdaterError } from './errors.js';

/** Minimal read-only structural view of ctx.credentials; the provider owns storage and precedence. */
export interface CredentialReferences {
  resolve(reference: string): Promise<{ readonly value: string } | undefined>;
}

/** Resolve per request so stored rotations/removals take effect without caching or reactivation. */
export async function resolveGithubToken(
  reference: string,
  credentials?: CredentialReferences,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<string | undefined> {
  try {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(reference)) throw new Error();
    // When present the service is authoritative, including absence and its own environment layers.
    // Do not bypass a failed provider or resurrect a removed credential from process.env.
    const value = credentials ? (await credentials.resolve(reference))?.value
      : Object.hasOwn(environment, reference) ? environment[reference] : undefined;
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string') throw new Error();
    return value;
  } catch { throw new UpdaterError('error.githubCredentials'); }
}
