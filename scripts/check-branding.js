#!/usr/bin/env node

/**
 * getfortrip - Brand Governance Automated Integrity Checker
 * Verifies zero-leakage of forbidden brand strings across entire repository.
 */

const fs = require('fs')
const path = require('path')

const FORBIDDEN_PATTERNS = [
  { regex: /tripscanner/i, label: 'TripScanner / tripscanner' },
  { regex: /trip\s+scanner/i, label: 'Trip Scanner' },
  { regex: /트립닷컴/, label: '트립닷컴' },
  { regex: /tripcdn/i, label: 'tripcdn' },
  { regex: /tripclone/i, label: 'tripclone' },
  // Match standalone trip.com but NOT getfortrip.com
  { regex: /(^|[^a-zA-Z0-9_-])trip\.com/i, label: 'Trip.com / trip.com' }
]

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.githooks',
  '.output',
  'dist',
  '.nuxt',
  '.system_generated',
  'brain',
  'scratch',
  'reports'
])

const IGNORED_FILES = new Set([
  'check-branding.js',
  'GOVERNANCE.md',
  'BRANDING.md'
])

const EXTENSIONS = new Set([
  '.vue',
  '.ts',
  '.js',
  '.html',
  '.json',
  '.jsonc',
  '.toml',
  '.sql',
  '.go',
  '.css',
  '.env.example'
])

let violations = []
let scannedCount = 0

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        walk(fullPath)
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (IGNORED_FILES.has(entry.name)) continue
      if (!EXTENSIONS.has(ext)) continue

      scannedCount++
      checkFile(fullPath)
    }
  }
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')

  lines.forEach((line, idx) => {
    for (const rule of FORBIDDEN_PATTERNS) {
      if (rule.regex.test(line)) {
        // Double-check false positive for getfortrip.com
        const match = line.match(rule.regex)
        if (rule.label.includes('trip.com') && /getfortrip\.com/i.test(line)) {
          // If the only occurrence of trip.com in this line is inside getfortrip.com, skip
          const stripped = line.replace(/getfortrip\.com/gi, '')
          if (!/(^|[^a-zA-Z0-9_-])trip\.com/i.test(stripped)) {
            continue
          }
        }

        violations.push({
          file: path.relative(process.cwd(), filePath).replace(/\\/g, '/'),
          line: idx + 1,
          rule: rule.label,
          snippet: line.trim()
        })
      }
    }
  })
}

console.log('🛡️ [getfortrip Brand Governance Guard] Scanning repository for brand integrity...')
const rootDir = process.cwd()
walk(rootDir)

console.log(`📊 Scanned ${scannedCount} files.`)

if (violations.length > 0) {
  console.error(`\n❌ ERROR: Found ${violations.length} forbidden branding violations:\n`)
  violations.forEach(v => {
    console.error(`  [${v.file}:${v.line}] Violation: "${v.rule}"`)
    console.error(`    ↳ ${v.snippet}\n`)
  })
  console.error('⚠️ Official Platform Name is getfortrip. Please remove all prohibited brand occurrences.')
  process.exit(1)
} else {
  console.log('✅ PASS: Brand integrity verified! All references strictly adhere to "getfortrip".\n')
  process.exit(0)
}

