import { afterEach, describe, expect, it } from 'vitest'
import {
  FORK_UPDATE_GITHUB_OWNER,
  FORK_UPDATE_GITHUB_REPO,
  getUpdateAtomFeedUrl,
  getUpdateGithubRepoSlug,
  getUpdateLatestDownloadUrl,
  getUpdateReleaseTagUrl,
  isAutoUpdateDisabled
} from './updater-feed'

describe('updater-feed', () => {
  const envKeys = [
    'ORCA_UPDATE_GITHUB_OWNER',
    'ORCA_UPDATE_GITHUB_REPO',
    'ORCA_ENABLE_AUTO_UPDATE'
  ] as const

  afterEach(() => {
    for (const key of envKeys) {
      delete process.env[key]
    }
  })

  it('defaults to the fork release feed', () => {
    expect(getUpdateGithubRepoSlug()).toBe(`${FORK_UPDATE_GITHUB_OWNER}/${FORK_UPDATE_GITHUB_REPO}`)
    expect(getUpdateAtomFeedUrl()).toBe(
      `https://github.com/${FORK_UPDATE_GITHUB_OWNER}/${FORK_UPDATE_GITHUB_REPO}/releases.atom`
    )
    expect(getUpdateLatestDownloadUrl()).toBe(
      `https://github.com/${FORK_UPDATE_GITHUB_OWNER}/${FORK_UPDATE_GITHUB_REPO}/releases/latest/download`
    )
    expect(getUpdateReleaseTagUrl('1.2.3')).toBe(
      `https://github.com/${FORK_UPDATE_GITHUB_OWNER}/${FORK_UPDATE_GITHUB_REPO}/releases/tag/v1.2.3`
    )
  })

  it('disables auto-update unless explicitly enabled', () => {
    expect(isAutoUpdateDisabled()).toBe(true)
    process.env.ORCA_ENABLE_AUTO_UPDATE = '1'
    expect(isAutoUpdateDisabled()).toBe(false)
  })
})
