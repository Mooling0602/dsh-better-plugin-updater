import type { PluginDetailProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
/** Render the repository link only for the bundle that owns it. */
export declare function RepositoryLink({ subject, bundleName }: PluginDetailProps & {
    readonly bundleName: string;
}): import("react").JSX.Element | null;
