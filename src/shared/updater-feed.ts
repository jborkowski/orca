// Why: fork builds must not silently pull signed releases from the upstream
// canonical repo and overwrite local customizations.
export const FORK_UPDATE_GITHUB_OWNER = 'jborkowski'
export const FORK_UPDATE_GITHUB_REPO = 'orca'

function readTruthyEnv(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}

export function getUpdateGithubOwner(): string {
  return process.env.ORCA_UPDATE_GITHUB_OWNER?.trim() || FORK_UPDATE_GITHUB_OWNER
}

export function getUpdateGithubRepo(): string {
  return process.env.ORCA_UPDATE_GITHUB_REPO?.trim() || FORK_UPDATE_GITHUB_REPO
}

export function getUpdateGithubRepoSlug(): string {
  return `${getUpdateGithubOwner()}/${getUpdateGithubRepo()}`
}

export function getUpdateAtomFeedUrl(): string {
  return `https://github.com/${getUpdateGithubRepoSlug()}/releases.atom`
}

export function getUpdateReleasesDownloadBase(): string {
  return `https://github.com/${getUpdateGithubRepoSlug()}/releases/download`
}

export function getUpdateLatestDownloadUrl(): string {
  return `https://github.com/${getUpdateGithubRepoSlug()}/releases/latest/download`
}

export function getUpdateReleasesUrl(): string {
  return `https://github.com/${getUpdateGithubRepoSlug()}/releases`
}

export function getUpdateReleaseTagUrl(version: string): string {
  const tag = version.startsWith('v') ? version : `v${version}`
  return `https://github.com/${getUpdateGithubRepoSlug()}/releases/tag/${tag}`
}

export function getUpdateReleaseTagHrefPattern(): RegExp {
  const slug = getUpdateGithubRepoSlug().replace('/', '\\/')
  return new RegExp(`href="https:\\/\\/github\\.com\\/${slug}\\/releases\\/tag\\/([^"]+)"`, 'g')
}

// Disabled by default on this fork so upstream cannot overwrite local builds.
// Set ORCA_ENABLE_AUTO_UPDATE=1 to re-enable (feed still targets this fork).
export function isAutoUpdateDisabled(): boolean {
  return !readTruthyEnv('ORCA_ENABLE_AUTO_UPDATE')
}
