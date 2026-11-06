/** Read-only npm and GitHub providers; installation is owned by the coordinator. */
import { gt, prerelease, valid } from 'semver';
import { UpdaterError } from '../errors.js';
import { message } from '../i18n.js';
import { releaseAttachment } from '../sources.js';
function object(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new UpdaterError('error.metadataObject');
    return value;
}
function text(value) {
    if (typeof value !== 'string' || !value)
        throw new UpdaterError('error.metadataString');
    return value;
}
function compare(bundle, candidate, pinned) {
    if (pinned)
        return { status: 'pinned', ...message('msg.versionPinned'), candidate };
    if (!bundle.version || !valid(bundle.version) || !candidate.version || !valid(candidate.version)) {
        return { status: 'unknown', ...message('msg.versionUnknown'), candidate };
    }
    return gt(candidate.version, bundle.version)
        ? { status: 'update-available', ...message('msg.versionUpdate'), candidate }
        : { status: 'current', ...message('msg.versionCurrent'), candidate };
}
function repository(value) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) || value.split('/').some(part => part === '.' || part === '..')) {
        throw new UpdaterError('error.repository');
    }
    return value.split('/').map(encodeURIComponent).join('/');
}
const npm = {
    kind: 'npm',
    async check(bundle, source, client, signal) {
        if (source.kind !== 'npm')
            throw new UpdaterError('error.npmSource');
        const metadata = object(await client.get(`${source.registry}${encodeURIComponent(source.packageName)}`, signal));
        if (metadata.name !== source.packageName)
            throw new UpdaterError('error.registryIdentity');
        const version = text(object(metadata['dist-tags'])[source.channel]);
        if (!valid(version))
            throw new UpdaterError('error.registryVersion');
        if (prerelease(version))
            return { status: 'unsupported', ...message('msg.prerelease') };
        const manifest = object(object(metadata.versions)[version]);
        if (manifest.name !== source.packageName || manifest.version !== version)
            throw new UpdaterError('error.registryManifest');
        if (!object(manifest.dsh).bundle)
            throw new UpdaterError('error.registryBundle');
        const compared = compare(bundle, { spec: `${source.packageName}@${version}`, version, registry: source.registry }, false);
        if (!source.pinned)
            return compared;
        if (compared.status === 'update-available') {
            return { ...compared, status: 'pinned', ...message('msg.npmPinnedUpdate', { name: source.packageName }) };
        }
        if (compared.status === 'current')
            return { ...compared, ...message('msg.npmPinnedCurrent') };
        return compared;
    },
};
const githubSource = {
    kind: 'github-source',
    async check(_bundle, source, client, signal) {
        if (source.kind !== 'github-source')
            throw new UpdaterError('error.gitSource');
        const data = object(await client.get(`https://api.github.com/repos/${repository(source.repository)}/commits/${encodeURIComponent(source.ref)}`, signal));
        const revision = text(data.sha).toLowerCase();
        if (!/^[a-f0-9]{40}$/.test(revision))
            throw new UpdaterError('error.gitSha');
        const candidate = { spec: `${source.baseSpec}#${revision}`, revision };
        if (source.pinned)
            return { status: 'pinned', ...message('msg.gitPinned'), candidate };
        if (!source.currentRevision || !/^[a-f0-9]{40}$/i.test(source.currentRevision)) {
            return { status: 'unknown', ...message('msg.gitUnknown'), candidate };
        }
        return source.currentRevision.toLowerCase() === revision
            ? { status: 'current', ...message('msg.gitCurrent'), candidate }
            : { status: 'update-available', ...message('msg.gitUpdate'), candidate };
    },
};
const githubRelease = {
    kind: 'github-release',
    async check(bundle, source, client, signal) {
        if (source.kind !== 'github-release')
            throw new UpdaterError('error.releaseSource');
        const base = `https://api.github.com/repos/${repository(source.repository)}/releases`;
        // GitHub's latest marker excludes prereleases and is not a SemVer ordering.
        let data;
        let highest;
        for (let page = 1; page <= 10; page++) {
            const releases = await client.get(`${base}?per_page=100&page=${page}`, signal);
            if (!Array.isArray(releases))
                throw new UpdaterError('error.metadataObject');
            for (const item of releases.map(object)) {
                if (item.draft !== false || typeof item.prerelease !== 'boolean' || typeof item.tag_name !== 'string')
                    continue;
                const version = valid(item.tag_name.replace(/^v/, ''));
                if (version && (!highest || gt(version, highest))) {
                    highest = version;
                    data = item;
                }
            }
            if (releases.length < 100)
                break;
            if (page === 10)
                throw new UpdaterError('error.releasePageLimit');
        }
        if (!data || !highest)
            return { status: 'unsupported', ...message('msg.releaseTag') };
        const tag = text(data.tag_name);
        const version = highest;
        const name = source.assetTemplate.replaceAll('{tag}', tag).replaceAll('{version}', version);
        if (/[{}\/\\\x00-\x1f]/.test(name) || !/\.(?:tgz|tar\.gz)$/i.test(name))
            throw new UpdaterError('error.releaseTemplate');
        if (!Array.isArray(data.assets))
            throw new UpdaterError('error.releaseAssets');
        const matches = data.assets.map(object).filter(asset => asset.name === name && asset.state === 'uploaded');
        if (matches.length !== 1)
            return { status: 'unsupported', ...message('msg.releaseAsset') };
        const url = text(matches[0].browser_download_url);
        const asset = releaseAttachment(url);
        if (!asset || asset.repository.toLowerCase() !== source.repository.toLowerCase() || asset.tag !== tag || asset.asset !== name) {
            throw new UpdaterError('error.releaseOrigin');
        }
        return compare(bundle, { spec: url, version, url }, source.pinned);
    },
};
/** Construct the built-in providers without making network requests or creating timers. */
export function createProviders() {
    return [npm, githubSource, githubRelease];
}
//# sourceMappingURL=index.js.map