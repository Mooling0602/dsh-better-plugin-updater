/** GitHub-only detail-page operations backed by the shared update coordinator. */
import { randomUUID } from 'node:crypto';
import { githubRepository, releaseAttachment } from './sources.js';
import { isActionable, Updater } from './updater.js';
import type { ApplyResult, CheckResult, UpdatePlan } from './types.js';

/** A readable GitHub dependency that can be presented on a bundle detail page. */
export interface GitHubDetail {
  readonly name: string;
  readonly repository: string;
  readonly kind: 'github-source' | 'github-release';
  readonly installed?: string;
  readonly fixedPin: boolean;
}

/** A check result and its separately identified, immutable confirmation plan. */
export interface GitHubDetailCheck {
  readonly result: CheckResult;
  readonly confirmation?: { readonly id: string; readonly plan: UpdatePlan };
}

/** Restrict a page adapter to GitHub operations without accepting a browser-supplied target. */
export class GitHubUi {
  private readonly confirmations = new Map<string, UpdatePlan>();
  private readonly checking = new Set<string>();

  constructor(private readonly updater: Updater, private readonly now: () => number = Date.now) {}

  /** Identify a GitHub source using current Host inventory without making a network request. */
  async describe(name: string): Promise<GitHubDetail | undefined> {
    const bundle = (await this.updater.list()).find(item => item.name === name);
    if (!bundle?.installed || bundle.availability !== 'profile' || !bundle.source) return undefined;
    const git = githubRepository(bundle.source);
    if (git) return { name, repository: git.repository, kind: 'github-source', fixedPin: /^[a-f0-9]{40}$/i.test(git.ref),
      ...(/^[a-f0-9]{40}$/i.test(git.ref) ? { installed: git.ref } : bundle.version === undefined ? {} : { installed: bundle.version }) };
    const release = releaseAttachment(bundle.source);
    return release ? { name, repository: release.repository, kind: 'github-release', fixedPin: false, ...(bundle.version === undefined ? {} : { installed: bundle.version }) } : undefined;
  }

  /** Check through the same providers as the slash command and freeze any actionable target. */
  async check(name: string, signal?: AbortSignal): Promise<GitHubDetailCheck | undefined> {
    if (this.checking.has(name)) throw new Error('A check for this package is already running.');
    this.checking.add(name);
    try {
      const now = this.now();
      for (const [id, plan] of this.confirmations) {
        if (plan.bundle.name === name || Date.parse(plan.expiresAt) <= now) {
          this.confirmations.delete(id);
          this.updater.discard(plan.id);
        }
      }
      const result = await this.updater.checkGithub(name, signal);
      if (!result) return undefined;
      if (!isActionable(result, true)) return { result };
      if (this.confirmations.size >= 1000) throw new Error('Too many pending update confirmations.');
      const plan = this.updater.prepare(result, true);
      const id = randomUUID();
      this.confirmations.set(id, plan);
      return { result, confirmation: { id, plan } };
    } finally {
      this.checking.delete(name);
    }
  }

  /** Apply only a single-use plan issued by this adapter after explicit risk acknowledgement. */
  async apply(id: string, acceptRemovalRisk: boolean): Promise<ApplyResult> {
    if (acceptRemovalRisk !== true) throw new Error('Update risk must be acknowledged.');
    const plan = this.confirmations.get(id);
    if (!plan || Date.parse(plan.expiresAt) <= this.now()) {
      this.confirmations.delete(id);
      if (plan) this.updater.discard(plan.id);
      throw new Error('Update confirmation is missing or expired.');
    }
    this.confirmations.delete(id);
    return this.updater.apply(plan.id, true);
  }
}
