#!/usr/bin/env -S npx tsx
/**
 * Thin CLI over lib/artifacts/discovery.ts (one owner per artifact — B3).
 *
 *   npm run check:discovery            report + write the cache artifact
 *   npm run check:discovery -- --check report only, write nothing
 *   npm run check:discovery -- --json  machine-readable to stdout
 */
import { scanDiscovery } from "../lib/artifacts/discovery"

const args = process.argv.slice(2)
const checkOnly = args.includes("--check")
const asJson = args.includes("--json")

const doc = scanDiscovery({ write: !checkOnly && !asJson })

if (asJson) {
  console.log(JSON.stringify(doc, null, 2))
} else {
  console.log(`\nDiscovery — files beside registered documents that no entry covers\n`)
  console.log(
    `  ${doc.treesWalked} tree(s) walked (the directories behind ${doc.covered} path-bearing sources)`
  )
  if (doc.uncovered.length === 0) {
    console.log(`  Nothing uncovered — every document-shaped sibling is registered.\n`)
  } else {
    console.log(`  ${doc.uncovered.length} file(s) no manifest entry covers:\n`)
    for (const u of doc.uncovered.slice(0, 20)) {
      console.log(`    ${u.mtime ?? "????-??-??"}  ${u.path}`)
    }
    if (doc.uncovered.length > 20) console.log(`    … and ${doc.uncovered.length - 20} more`)
    console.log(
      `\n  Record, don't duplicate: register each as a document (Add document, or the\n` +
        `  manifest) with a note naming its generator — or add it to\n` +
        `  data/knowledge/discovery-ignore.json if it is genuinely not knowledge.\n`
    )
  }
  if (!checkOnly) console.log(`  written → .synclair/cache/knowledge/discovery.json\n`)
}
