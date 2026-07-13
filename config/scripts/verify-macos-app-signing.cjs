#!/usr/bin/env node

const { execFileSync, spawnSync } = require('node:child_process')
const { lstatSync, openSync, closeSync, readSync, readdirSync } = require('node:fs')
const { join, resolve } = require('node:path')

const MACH_O_MAGICS = new Set(['cafebabe', 'cafebabf', 'feedface', 'feedfacf'])

function runCodesign(args) {
  try {
    return execFileSync('/usr/bin/codesign', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
  } catch (error) {
    const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim()
    throw new Error(detail || `codesign ${args.join(' ')} failed`)
  }
}

function signingDetails(targetPath) {
  const result = spawnSync('/usr/bin/codesign', ['-dvvv', targetPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  // `codesign -d` writes its successful display output to stderr.
  if (result.status !== 0 || !output.includes('TeamIdentifier=')) {
    throw new Error(output.trim() || `Unable to inspect signature for ${targetPath}`)
  }
  return output
}

function teamIdentifier(targetPath) {
  const match = signingDetails(targetPath).match(/^TeamIdentifier=(.+)$/m)
  if (!match || match[1] === 'not set') {
    return null
  }
  return match[1].trim()
}

function isMachO(filePath) {
  const descriptor = openSync(filePath, 'r')
  try {
    const bytes = Buffer.alloc(4)
    if (readSync(descriptor, bytes, 0, bytes.length, 0) !== bytes.length) {
      return false
    }
    const bigEndian = bytes.toString('hex')
    const littleEndian = Buffer.from(bytes).reverse().toString('hex')
    return MACH_O_MAGICS.has(bigEndian) || MACH_O_MAGICS.has(littleEndian)
  } finally {
    closeSync(descriptor)
  }
}

function collectMachOBinaries(rootPath, result = []) {
  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    const entryPath = join(rootPath, entry.name)
    if (entry.isSymbolicLink()) {
      continue
    }
    if (entry.isDirectory()) {
      collectMachOBinaries(entryPath, result)
      continue
    }
    if (entry.isFile() && lstatSync(entryPath).size >= 4 && isMachO(entryPath)) {
      result.push(entryPath)
    }
  }
  return result
}

function verifyMacAppSigning(appPath) {
  const resolvedAppPath = resolve(appPath)
  runCodesign(['--verify', '--deep', '--strict', '--verbose=2', resolvedAppPath])
  const appTeamIdentifier = teamIdentifier(resolvedAppPath)
  if (!appTeamIdentifier) {
    throw new Error(`Release app has no Team ID: ${resolvedAppPath}`)
  }

  const mismatches = []
  for (const binaryPath of collectMachOBinaries(resolvedAppPath)) {
    // Why: link-time Mach-O object files are package data, not loadable code,
    // so codesign neither signs nor validates them for library loading.
    if (binaryPath.endsWith('.o')) {
      continue
    }
    let binaryTeamIdentifier
    try {
      binaryTeamIdentifier = teamIdentifier(binaryPath)
    } catch (error) {
      mismatches.push(`${binaryPath}: ${error.message}`)
      continue
    }
    if (binaryTeamIdentifier !== appTeamIdentifier) {
      mismatches.push(
        `${binaryPath}: TeamIdentifier=${binaryTeamIdentifier ?? 'not set'} (expected ${appTeamIdentifier})`
      )
    }
  }
  if (mismatches.length > 0) {
    throw new Error(`Embedded Mach-O signing mismatch:\n${mismatches.join('\n')}`)
  }
  console.log(
    `[verify-macos-app-signing] ${resolvedAppPath} and all embedded Mach-O files use Team ID ${appTeamIdentifier}`
  )
}

if (require.main === module) {
  const appPath = process.argv[2]
  if (!appPath) {
    console.error('Usage: node config/scripts/verify-macos-app-signing.cjs /path/to/Orca.app')
    process.exit(2)
  }
  verifyMacAppSigning(appPath)
}

module.exports = { collectMachOBinaries, isMachO, teamIdentifier, verifyMacAppSigning }
