/** Validated Cordis configuration, with explicit source policy instead of implicit origin switching. */
import { z } from 'zod';
/** Configuration is inert until a user explicitly invokes a check or update command. */
export declare const Config: z.ZodObject<{
    language: z.ZodDefault<z.ZodEnum<{
        en: "en";
        zh: "zh";
        auto: "auto";
    }>>;
    requestTimeoutMs: z.ZodDefault<z.ZodNumber>;
    maxMetadataBytes: z.ZodDefault<z.ZodNumber>;
    planTtlMs: z.ZodDefault<z.ZodNumber>;
    githubTokenEnv: z.ZodDefault<z.ZodString>;
    sources: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"npm">;
        registry: z.ZodOptional<z.ZodString>;
        channel: z.ZodDefault<z.ZodString>;
        allowPinned: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"github-source">;
        repository: z.ZodString;
        ref: z.ZodOptional<z.ZodString>;
        allowPinned: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"github-release">;
        repository: z.ZodString;
        assetTemplate: z.ZodString;
        allowPinned: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"index">;
        url: z.ZodString;
    }, z.core.$strip>], "kind">>>;
    indexes: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
/** Parsed runtime settings. Global indexes are reserved and never fetched in this version. */
export type UpdaterConfig = z.infer<typeof Config>;
