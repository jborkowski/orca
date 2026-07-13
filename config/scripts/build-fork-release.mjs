#!/usr/bin/env node
/**
 * Local fork release builder for jborkowski/orca.
 * Produces macOS arm64 desktop artifacts and mobile builds when tooling is present.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const releaseRoot = path.join(repoRoot, 'dist', 'fork-release')
const desktopOut = path.join(releaseRoot, 'desktop')
const mobileOut = path.join(releaseRoot, 'mobile')

function run(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: 'inherit',
    env: { ...process.env, ...options.env }
  })
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command} ${args.join(' ')}`)
  }
}

function readVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  return String(pkg.version)
}

function readMobileVersion() {
  const app = JSON.parse(fs.readFileSync(path.join(repoRoot, 'mobile', 'app.json'), 'utf8'))
  return String(app.expo.version)
}

function stageDesktopArtifacts(version) {
  const distDir = path.join(repoRoot, 'dist')
  const artifacts = [
    ['orca-macos-arm64.dmg', 'orca-macos-arm64.dmg'],
    [`Orca-${version}-arm64-mac.zip`, `Orca-${version}-arm64-mac.zip`]
  ]
  fs.mkdirSync(desktopOut, { recursive: true })
  for (const [sourceName, destinationName] of artifacts) {
    const source = path.join(distDir, sourceName)
    if (!fs.existsSync(source)) {
      console.warn(`Missing desktop artifact: ${source}`)
      continue
    }
    const dest = path.join(desktopOut, destinationName)
    fs.copyFileSync(source, dest)
    console.log(`Staged ${dest}`)
  }
  fs.writeFileSync(
    path.join(desktopOut, 'RELEASE.txt'),
    [
      `Orca fork desktop release`,
      `Version: ${version}`,
      `Repo: jborkowski/orca`,
      `Auto-update: disabled by default (ORCA_ENABLE_AUTO_UPDATE=1 to enable)`,
      `Feed: https://github.com/jborkowski/orca/releases`,
      ''
    ].join('\n')
  )
}

function findDeveloperIdApplicationIdentity() {
  const result = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
    encoding: 'utf8'
  })
  if (result.status !== 0) {
    throw new Error('Unable to query the macOS code-signing identities')
  }
  const match = result.stdout.match(
    /^\s*\d+\)\s+([0-9A-F]{40})\s+"Developer ID Application:[^"]+"/m
  )
  if (!match) {
    throw new Error('A Developer ID Application identity is required for a fork desktop release')
  }
  // Why: certificates with the same display name are common after renewal;
  // the SHA-1 identity keeps codesign from rejecting the name as ambiguous.
  return match[1]
}

function findJavaHome() {
  if (process.env.JAVA_HOME && fs.existsSync(process.env.JAVA_HOME)) {
    return process.env.JAVA_HOME
  }
  const candidates = ['openjdk@17', 'openjdk', 'temurin@17']
  for (const formula of candidates) {
    try {
      const brewPrefix = execFileSync('brew', ['--prefix', formula], {
        encoding: 'utf8'
      }).trim()
      const home = path.join(brewPrefix, 'libexec', 'openjdk.jdk', 'Contents', 'Home')
      if (fs.existsSync(home)) {
        return home
      }
    } catch {
      // Try the next JDK install.
    }
  }
  return null
}

function findAndroidHome() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(process.env.HOME || '', 'Library', 'Android', 'sdk')
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

function buildDesktopArm64(version) {
  const signingIdentity = findDeveloperIdApplicationIdentity()
  run('pnpm', ['run', 'build:desktop'])
  run('pnpm', ['run', 'build:computer-macos'])
  run('pnpm', ['run', 'build:notification-status-macos'])
  run('pnpm', ['run', 'ensure:electron-runtime'])
  run(
    'pnpm',
    [
      'exec',
      'electron-builder',
      '--config',
      'config/electron-builder.config.cjs',
      '--mac',
      'dmg',
      'zip',
      '--arm64'
    ],
    {
      env: {
        CSC_NAME: signingIdentity,
        ORCA_COMPUTER_MACOS_SIGN_IDENTITY: signingIdentity,
        ORCA_MAC_RELEASE: '1',
        // Why: fork releases use Developer ID signing and hardened runtime but
        // currently lack the Apple credentials required for notarization.
        ORCA_MAC_NOTARIZE: '0'
      }
    }
  )
  run('node', [
    'config/scripts/verify-macos-app-signing.cjs',
    path.join(repoRoot, 'dist', 'mac-arm64', 'Orca.app')
  ])
  stageDesktopArtifacts(version)
}

function buildAndroidApk(mobileVersion) {
  const javaHome = findJavaHome()
  const androidHome = findAndroidHome()
  if (!javaHome || !androidHome) {
    console.warn(
      'Skipping Android APK: need JAVA_HOME and ANDROID_HOME/Android SDK. Install OpenJDK and Android command-line tools, then re-run.'
    )
    return false
  }

  const mobileDir = path.join(repoRoot, 'mobile')
  run('pnpm', ['install', '--frozen-lockfile'], { cwd: mobileDir })
  run('node', ['scripts/prepare-android-release.mjs'], {
    cwd: mobileDir,
    env: {
      JAVA_HOME: javaHome,
      ANDROID_HOME: androidHome,
      ANDROID_SDK_ROOT: androidHome,
      MOBILE_ANDROID_PUBLISH_RELEASE: 'false'
    }
  })
  run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install'], {
    cwd: mobileDir,
    env: { JAVA_HOME: javaHome, ANDROID_HOME: androidHome, ANDROID_SDK_ROOT: androidHome }
  })
  run('./gradlew', ['assembleRelease'], {
    cwd: path.join(mobileDir, 'android'),
    env: { JAVA_HOME: javaHome, ANDROID_HOME: androidHome, ANDROID_SDK_ROOT: androidHome }
  })

  fs.mkdirSync(mobileOut, { recursive: true })
  const apkDir = path.join(mobileDir, 'android', 'app', 'build', 'outputs', 'apk', 'release')
  const apk = fs.readdirSync(apkDir).find((name) => name.endsWith('.apk'))
  if (!apk) {
    throw new Error(`No APK found in ${apkDir}`)
  }
  const dest = path.join(mobileOut, `orca-mobile-android-v${mobileVersion}.apk`)
  fs.copyFileSync(path.join(apkDir, apk), dest)
  console.log(`Staged ${dest}`)
  return true
}

function buildIosArchive(mobileVersion) {
  const mobileDir = path.join(repoRoot, 'mobile')
  run('pnpm', ['install', '--frozen-lockfile'], { cwd: mobileDir })
  run('npx', ['expo', 'prebuild', '--platform', 'ios', '--no-install'], { cwd: mobileDir })
  run('npx', ['pod-install', 'ios'], { cwd: mobileDir })

  fs.mkdirSync(mobileOut, { recursive: true })
  const archivePath = path.join(mobileOut, `orca-mobile-ios-v${mobileVersion}.xcarchive`)
  run(
    'xcodebuild',
    [
      '-workspace',
      path.join(mobileDir, 'ios', 'Orca.xcworkspace'),
      '-scheme',
      'Orca',
      '-configuration',
      'Release',
      '-destination',
      'generic/platform=iOS',
      '-archivePath',
      archivePath,
      'archive',
      'CODE_SIGNING_ALLOWED=NO'
    ],
    { cwd: mobileDir }
  )
  console.log(`Staged unsigned archive: ${archivePath}`)
  return true
}

function writeManifest(version, mobileVersion, androidBuilt, iosBuilt) {
  fs.mkdirSync(releaseRoot, { recursive: true })
  const manifest = {
    desktopVersion: version,
    mobileVersion,
    repo: 'jborkowski/orca',
    createdAt: new Date().toISOString(),
    artifacts: {
      desktop: {
        macosArm64Dmg: path.join(desktopOut, 'orca-macos-arm64.dmg'),
        macosArm64Zip: path.join(desktopOut, `Orca-${version}-arm64-mac.zip`)
      },
      mobile: {
        androidApk: androidBuilt
          ? path.join(mobileOut, `orca-mobile-android-v${mobileVersion}.apk`)
          : null,
        iosArchive: iosBuilt
          ? path.join(mobileOut, `orca-mobile-ios-v${mobileVersion}.xcarchive`)
          : null
      }
    },
    githubReleaseTags: {
      desktop: `v${version}`,
      android: `mobile-android-v${mobileVersion}`,
      ios: `mobile-ios-v${mobileVersion}`
    }
  }
  fs.writeFileSync(
    path.join(releaseRoot, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  )
  console.log(`\nRelease manifest: ${path.join(releaseRoot, 'manifest.json')}`)
}

const version = readVersion()
const mobileVersion = readMobileVersion()
console.log(`Building fork release desktop=${version} mobile=${mobileVersion}`)

fs.mkdirSync(releaseRoot, { recursive: true })

buildDesktopArm64(version)
const androidBuilt = buildAndroidApk(mobileVersion)
let iosBuilt = false
try {
  iosBuilt = buildIosArchive(mobileVersion)
} catch (error) {
  console.warn(
    `iOS archive build failed: ${error instanceof Error ? error.message : String(error)}`
  )
}
writeManifest(version, mobileVersion, androidBuilt, iosBuilt)
