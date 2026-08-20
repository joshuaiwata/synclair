#!/usr/bin/env node
/**
 * Form-default check — an untouched form must not fabricate specifics.
 *
 * The Add-document dialog once initialized its Area select to `areas[0]`, so
 * every document added without touching the dropdown was silently filed under
 * whatever area sorted first (found by the C2 add drill: a drill doc landed in
 * a specific product area nobody chose). Defaults that pick a concrete value
 * on the user's behalf are data corruption with a calm face — the neutral
 * value ("all") is the only honest default.
 *
 * Source-level assertion, same species as check:purity: cheap, specific, and
 * it fires at author time with a fix instruction.
 */
import { readFileSync } from "node:fs"

const FILE = "app/synclair/(hub)/knowledge/add-document-dialog.tsx"
let src
try {
  src = readFileSync(FILE, "utf8")
} catch {
  // A hub generation without the Add-document dialog has no default to check.
  console.log("check:form-defaults — no Add-document dialog in this hub; nothing to check.")
  process.exit(0)
}

const failures = []

if (!/const \[area, setArea\] = useState\("all"\)/.test(src)) {
  failures.push(
    `${FILE}: the Area select must initialize to useState("all") — a concrete area as the default silently misfiles every document added without touching the dropdown. Keep "all" as the initial and reset value.`
  )
}
if (!/setArea\("all"\)/.test(src)) {
  failures.push(
    `${FILE}: reset() must return the Area select to "all" (setArea("all")) so a reopened dialog doesn't inherit the last add's area.`
  )
}

if (failures.length) {
  console.error("check:form-defaults —")
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}
console.log("check:form-defaults — untouched forms stay neutral (Add-document area defaults to \"all\").")
