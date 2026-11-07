/** Connect a GitHub detail contribution to its owner-only Host facade. */
import { type ReactNode } from 'react';
import type { PluginDetailProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
/** Client-side Remote methods provided by the mounted contribution. */
export interface GitHubRemoteClient {
    describe(name: string): Promise<RemoteResult<string>>;
    check(name: string): Promise<RemoteResult<string>>;
    apply(id: string, acceptRemovalRisk: boolean, language: string): Promise<RemoteResult<string>>;
}
/** The observable interface-language source needed by the detail contribution. */
export interface GitHubViewLocale {
    getSnapshot(): {
        readonly active: unknown;
    };
    subscribe(listener: () => void): () => void;
}
/** Host inventory change notifications used to refresh an open detail page. */
export interface GitHubViewEvents {
    subscribe(listener: () => void): () => void;
}
/** Slot owner props and the services injected by its registration. */
export interface GitHubUpdateViewProps extends PluginDetailProps {
    readonly remote: GitHubRemoteClient;
    readonly locale: GitHubViewLocale;
    readonly events: GitHubViewEvents;
}
/** Contribute only to package detail pages and reset state when their subject changes. */
export declare function GitHubUpdateView({ subject, remote, locale, events }: GitHubUpdateViewProps): ReactNode;
