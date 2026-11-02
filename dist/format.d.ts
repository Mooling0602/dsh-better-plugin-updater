import type { Language } from './i18n.js';
import type { ApplyResult, CheckResult, InstalledBundle, UpdatePlan } from './types.js';
/** Render installed packages separately from DSH-owned bundles and absent catalog offers. */
export declare function formatInventory(bundles: readonly InstalledBundle[], language?: Language): string;
/** Group check outcomes by actionability without hiding skipped or failed packages. */
export declare function formatChecks(results: readonly CheckResult[], language?: Language): string;
/** Render the exact target, expiry and every warning before the unchanged user-only command. */
export declare function formatPlan(plan: UpdatePlan, language?: Language): string;
/** Preserve partial failures and raw third-party diagnostics in both supported languages. */
export declare function formatApply(result: ApplyResult, language?: Language): string;
/** Render help without translating literal command keywords or the explicit risk acknowledgement. */
export declare function formatUsage(language?: Language): string;
/** Translate owned failures by identifier; never guess translations from arbitrary diagnostic text. */
export declare function formatCommandError(error: unknown, language?: Language): string;
