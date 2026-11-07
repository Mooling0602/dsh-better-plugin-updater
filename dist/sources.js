/** Conservative source inference for profile-owned bundle dependencies. */
import { clean, valid } from 'semver';
import { UpdaterError } from './errors.js';
import { message } from './i18n.js';
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA = /^[a-f0-9]{40}$/i;
const PACKAGE = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
/** Normalize an explicit HTTPS registry without embedding credentials in plans or logs. */
export function normalizeRegistry(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new UpdaterError('error.registryUrl');
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
        throw new UpdaterError('error.registryUrl');
    }
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
    return url.href;
}
/** Read a GitHub source identity without resolving its ref or executing Git. */
export function githubRepository(spec) {
    const [baseSpec, ...fragments] = spec.split('#');
    if (!baseSpec || fragments.length > 1)
        return undefined;
    let repository;
    if (baseSpec.startsWith('github:'))
        repository = baseSpec.slice(7);
    else if (baseSpec.startsWith('git@github.com:'))
        repository = baseSpec.slice(15);
    else {
        try {
            const url = new URL(baseSpec.replace(/^git\+/, ''));
            if (url.hostname !== 'github.com' || url.port || url.search || url.password
                || !['https:', 'ssh:'].includes(url.protocol)
                || (url.protocol === 'https:' && url.username)
                || (url.protocol === 'ssh:' && url.username !== 'git'))
                return undefined;
            repository = url.pathname.slice(1);
        }
        catch {
            return undefined;
        }
    }
    repository = repository.replace(/\.git$/, '');
    const ref = fragments[0] || 'HEAD';
    if (!REPOSITORY.test(repository) || repository.split('/').some(part => part === '.' || part === '..')
        || /[\s&\x00-\x1f]/.test(ref) || ref.startsWith('semver:') || ref.startsWith('path:'))
        return undefined;
    return { repository, baseSpec, ref };
}
/** Read an exact GitHub release attachment URL, not an auto-generated source archive. */
export function releaseAttachment(spec) {
    try {
        const url = new URL(spec);
        if (url.protocol !== 'https:' || url.host !== 'github.com' || url.username || url.password || url.search || url.hash)
            return undefined;
        const parts = url.pathname.split('/').slice(1).map(decodeURIComponent);
        if (parts.length !== 6 || parts[2] !== 'releases' || parts[3] !== 'download')
            return undefined;
        const repository = `${parts[0]}/${parts[1]}`;
        const tag = parts[4];
        const asset = parts[5];
        if (!REPOSITORY.test(repository) || !tag || !asset || /[/\\\x00-\x1f]/.test(tag + asset)
            || !/\.(?:tgz|tar\.gz)$/i.test(asset))
            return undefined;
        return { repository, tag, asset };
    }
    catch {
        return undefined;
    }
}
/** Infer a provider request; unsupported forms remain visible rather than falling back to another origin. */
export function inferSource(bundle, context) {
    const unsupported = (key) => {
        const text = message(key);
        return { kind: 'unsupported', reason: text.message, detail: text.detail };
    };
    const spec = bundle.source;
    const override = context.override;
    if (override?.kind === 'index')
        return unsupported('msg.indexReserved');
    if (!spec || /^(?:file:|link:|\/)/.test(spec))
        return unsupported('msg.localSource');
    const release = releaseAttachment(spec);
    const git = githubRepository(spec);
    if (release) {
        if (override && override.kind !== 'github-release')
            return unsupported('msg.sourceKind');
        if (override && override.repository.toLowerCase() !== release.repository.toLowerCase())
            return unsupported('msg.repositoryMismatch');
        const version = valid(release.tag.replace(/^v/, ''));
        const template = override?.assetTemplate ?? (release.asset.includes(release.tag)
            ? release.asset.replaceAll(release.tag, '{tag}')
            : version && release.asset.includes(version) ? release.asset.replaceAll(version, '{version}') : release.asset);
        return { kind: 'github-release', repository: release.repository, assetTemplate: template, currentTag: release.tag, pinned: false };
    }
    if (git) {
        if (override && override.kind !== 'github-source')
            return unsupported('msg.sourceKind');
        if (override && override.repository.toLowerCase() !== git.repository.toLowerCase())
            return unsupported('msg.repositoryMismatch');
        const exactPin = SHA.test(git.ref);
        const ref = context.gitBranch ?? override?.ref ?? (exactPin ? 'HEAD' : git.ref);
        if (!ref || /[\s&\x00-\x1f]/.test(ref) || ref.startsWith('semver:') || ref.startsWith('path:'))
            return unsupported('msg.gitSelector');
        const locked = context.currentRevision;
        const revision = exactPin
            ? locked !== undefined && (locked === null || !SHA.test(locked) || locked.toLowerCase() !== git.ref.toLowerCase()) ? undefined : git.ref.toLowerCase()
            : locked ?? undefined;
        const pinned = exactPin || (context.gitBranch === undefined
            ? SHA.test(ref) || valid(ref.replace(/^v/, '')) !== null
            : valid(git.ref.replace(/^v/, '')) !== null);
        return { kind: 'github-source', ...git, ref,
            ...(revision === undefined ? {} : { currentRevision: revision }),
            pinned: !override?.allowPinned && pinned };
    }
    if (override && override.kind !== 'npm')
        return unsupported('msg.githubOverride');
    if (!PACKAGE.test(bundle.name) || !spec.startsWith(`${bundle.name}@`))
        return unsupported('msg.unsupportedSource');
    const selector = spec.slice(bundle.name.length + 1);
    if (!selector || /:|\//.test(selector))
        return unsupported('msg.npmSelector');
    return { kind: 'npm', packageName: bundle.name, registry: normalizeRegistry(override?.registry ?? context.registry),
        channel: override?.channel ?? 'latest', pinned: clean(selector) !== null && !override?.allowPinned };
}
//# sourceMappingURL=sources.js.map