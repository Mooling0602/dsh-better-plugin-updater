/** Validated Cordis configuration, with explicit source policy instead of implicit origin switching. */
import Schema from '@deepseek-ai/schemastery';
/** Source policy for one package, discriminated on `kind`. */
export declare const Source: Schema<({
    kind?: "npm" | null;
    registry?: string | null;
    channel?: string | null;
    allowPinned?: boolean | null;
} & import("@deepseek-ai/cosmokit").Dict) | ({
    kind?: "github-source" | null;
    repository?: string | null;
    ref?: string | null;
    allowPinned?: boolean | null;
} & import("@deepseek-ai/cosmokit").Dict) | ({
    kind?: "github-release" | null;
    repository?: string | null;
    assetTemplate?: string | null;
    allowPinned?: boolean | null;
} & import("@deepseek-ai/cosmokit").Dict) | ({
    kind?: "index" | null;
    url?: string | null;
} & import("@deepseek-ai/cosmokit").Dict), Schemastery.ObjectT<NoInfer<{
    kind: Schema<"npm", "npm", "plain">;
    registry: Schema<string, string, "plain">;
    channel: Schema<string, string, "defined">;
    allowPinned: Schema<boolean, boolean, "defined">;
}>> | Schemastery.ObjectT<NoInfer<{
    kind: Schema<"github-source", "github-source", "plain">;
    repository: Schema<string, string, "plain">;
    ref: Schema<string, string, "plain">;
    allowPinned: Schema<boolean, boolean, "defined">;
}>> | Schemastery.ObjectT<NoInfer<{
    kind: Schema<"github-release", "github-release", "plain">;
    repository: Schema<string, string, "plain">;
    assetTemplate: Schema<string, string, "plain">;
    allowPinned: Schema<boolean, boolean, "defined">;
}>> | Schemastery.ObjectT<NoInfer<{
    kind: Schema<"index", "index", "plain">;
    url: Schema<string, string, "plain">;
}>>, "plain">;
/** Parsed runtime settings. Global indexes are reserved and never fetched in this version. */
export type UpdaterConfig = ReturnType<typeof Config>;
/**
 * Configuration is inert until a user explicitly invokes a check or update command.
 *
 * Cordis validates this schema before `apply` runs, so `apply` receives parsed
 * values. A volatile scalar is a live reference rather than a plain value, and
 * this plugin reads it through `.get()` at the point of use, so a value saved in
 * the settings page applies to the next request or command. Reading such a
 * field once during activation would freeze the value for the plugin lifetime.
 */
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    language: Schema<"en" | "zh" | "auto", "en" | "zh" | "auto", "volatile-defined">;
    requestTimeoutMs: Schema<number, number, "volatile-defined">;
    maxMetadataBytes: Schema<number, number, "volatile-defined">;
    planTtlMs: Schema<number, number, "volatile-defined">;
    /** Credential reference resolved by DSH (stored refs before environment fallbacks), not a token value. */
    githubTokenEnv: Schema<string, string, "volatile-defined">;
    sources: Schema<import("@deepseek-ai/cosmokit").Dict<({
        kind?: "npm" | null;
        registry?: string | null;
        channel?: string | null;
        allowPinned?: boolean | null;
    } & import("@deepseek-ai/cosmokit").Dict) | ({
        kind?: "github-source" | null;
        repository?: string | null;
        ref?: string | null;
        allowPinned?: boolean | null;
    } & import("@deepseek-ai/cosmokit").Dict) | ({
        kind?: "github-release" | null;
        repository?: string | null;
        assetTemplate?: string | null;
        allowPinned?: boolean | null;
    } & import("@deepseek-ai/cosmokit").Dict) | ({
        kind?: "index" | null;
        url?: string | null;
    } & import("@deepseek-ai/cosmokit").Dict), string>, import("@deepseek-ai/cosmokit").Dict<Schemastery.ObjectT<NoInfer<{
        kind: Schema<"npm", "npm", "plain">;
        registry: Schema<string, string, "plain">;
        channel: Schema<string, string, "defined">;
        allowPinned: Schema<boolean, boolean, "defined">;
    }>> | Schemastery.ObjectT<NoInfer<{
        kind: Schema<"github-source", "github-source", "plain">;
        repository: Schema<string, string, "plain">;
        ref: Schema<string, string, "plain">;
        allowPinned: Schema<boolean, boolean, "defined">;
    }>> | Schemastery.ObjectT<NoInfer<{
        kind: Schema<"github-release", "github-release", "plain">;
        repository: Schema<string, string, "plain">;
        assetTemplate: Schema<string, string, "plain">;
        allowPinned: Schema<boolean, boolean, "defined">;
    }>> | Schemastery.ObjectT<NoInfer<{
        kind: Schema<"index", "index", "plain">;
        url: Schema<string, string, "plain">;
    }>>, string>, "defined">;
    indexes: Schema<string[], string[], "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    language: Schema<"en" | "zh" | "auto", "en" | "zh" | "auto", "volatile-defined">;
    requestTimeoutMs: Schema<number, number, "volatile-defined">;
    maxMetadataBytes: Schema<number, number, "volatile-defined">;
    planTtlMs: Schema<number, number, "volatile-defined">;
    /** Credential reference resolved by DSH (stored refs before environment fallbacks), not a token value. */
    githubTokenEnv: Schema<string, string, "volatile-defined">;
    sources: Schema<import("@deepseek-ai/cosmokit").Dict<({
        kind?: "npm" | null;
        registry?: string | null;
        channel?: string | null;
        allowPinned?: boolean | null;
    } & import("@deepseek-ai/cosmokit").Dict) | ({
        kind?: "github-source" | null;
        repository?: string | null;
        ref?: string | null;
        allowPinned?: boolean | null;
    } & import("@deepseek-ai/cosmokit").Dict) | ({
        kind?: "github-release" | null;
        repository?: string | null;
        assetTemplate?: string | null;
        allowPinned?: boolean | null;
    } & import("@deepseek-ai/cosmokit").Dict) | ({
        kind?: "index" | null;
        url?: string | null;
    } & import("@deepseek-ai/cosmokit").Dict), string>, import("@deepseek-ai/cosmokit").Dict<Schemastery.ObjectT<NoInfer<{
        kind: Schema<"npm", "npm", "plain">;
        registry: Schema<string, string, "plain">;
        channel: Schema<string, string, "defined">;
        allowPinned: Schema<boolean, boolean, "defined">;
    }>> | Schemastery.ObjectT<NoInfer<{
        kind: Schema<"github-source", "github-source", "plain">;
        repository: Schema<string, string, "plain">;
        ref: Schema<string, string, "plain">;
        allowPinned: Schema<boolean, boolean, "defined">;
    }>> | Schemastery.ObjectT<NoInfer<{
        kind: Schema<"github-release", "github-release", "plain">;
        repository: Schema<string, string, "plain">;
        assetTemplate: Schema<string, string, "plain">;
        allowPinned: Schema<boolean, boolean, "defined">;
    }>> | Schemastery.ObjectT<NoInfer<{
        kind: Schema<"index", "index", "plain">;
        url: Schema<string, string, "plain">;
    }>>, string>, "defined">;
    indexes: Schema<string[], string[], "defined">;
}>>, "plain">;
