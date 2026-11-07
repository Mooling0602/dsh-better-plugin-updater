/** Owner-only Remote facade for the GitHub detail-page update flow. */
import type { Context } from '@deepseek-ai/cordis';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { GitHubUi } from './github-ui.js';
import { formatApply } from './format.js';

/** Expose only GitHub detail operations, leaving package writes to the shared coordinator. */
export class GitHubRemote extends TypertRemoteService {
  constructor(ctx: Context, private readonly ui: GitHubUi) {
    super(ctx, 'betterPluginUpdaterUi');
  }

  private owner(): void {
    if (this.ctx.invocation?.peer.principal.kind !== 'owner') throw new Error('Only the Host owner may manage plugin updates.');
  }

  /** Identify one package without checking a registry or changing the profile. */
  @Remote
  async describe(name: string): Promise<string> {
    this.owner();
    if (typeof name !== 'string' || name.length < 1 || name.length > 214) throw new Error('Invalid package name.');
    return JSON.stringify((await this.ui.describe(name)) ?? null);
  }

  /** Check one GitHub dependency and return its immutable confirmation when actionable. */
  @Remote
  async check(name: string): Promise<string> {
    this.owner();
    if (typeof name !== 'string' || name.length < 1 || name.length > 214) throw new Error('Invalid package name.');
    return JSON.stringify((await this.ui.check(name, this.ctx.invocation?.signal)) ?? null);
  }

  /** Apply only a plan issued by the detail-page adapter after explicit risk acknowledgement. */
  @Remote
  async apply(id: string, acceptRemovalRisk: boolean, language: string): Promise<string> {
    this.owner();
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid confirmation identifier.');
    if (language !== 'en' && language !== 'zh') throw new Error('Invalid presentation language.');
    const result = await this.ui.apply(id, acceptRemovalRisk);
    return JSON.stringify({ status: result.status, text: formatApply(result, language) });
  }
}
