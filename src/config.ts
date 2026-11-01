/** Validated Cordis configuration, with explicit source policy instead of implicit origin switching. */
import { z } from 'zod';

const repository = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
const source = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('npm'), registry: z.string().url().optional(), channel: z.string().min(1).default('latest'), allowPinned: z.boolean().default(false) }),
  z.object({ kind: z.literal('github-source'), repository, ref: z.string().min(1).optional(), allowPinned: z.boolean().default(false) }),
  z.object({ kind: z.literal('github-release'), repository, assetTemplate: z.string().min(1), allowPinned: z.boolean().default(false) }),
  z.object({ kind: z.literal('index'), url: z.string().url() }),
]);

/** Configuration is inert until a user explicitly invokes a check or update command. */
export const Config = z.object({
  language: z.enum(['auto', 'en', 'zh']).default('auto'),
  requestTimeoutMs: z.number().int().min(100).max(120_000).default(15_000),
  maxMetadataBytes: z.number().int().min(1024).max(16 * 1024 * 1024).default(4 * 1024 * 1024),
  planTtlMs: z.number().int().min(1000).max(60 * 60_000).default(10 * 60_000),
  /** Credential reference resolved by DSH (stored refs before environment fallbacks), not a token value. */
  githubTokenEnv: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).default('GITHUB_TOKEN'),
  sources: z.record(z.string(), source).default({}),
  indexes: z.array(z.string().url()).default([]),
});

/** Parsed runtime settings. Global indexes are reserved and never fetched in this version. */
export type UpdaterConfig = z.infer<typeof Config>;
