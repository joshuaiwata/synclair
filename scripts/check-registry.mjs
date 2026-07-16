#!/usr/bin/env node
/**
 * Registry drift check — the machine-enforced half of the component-library
 * skill's registration rule. Verifies that registry.json, the component files,
 * the colocated *.docs.tsx files, and the lib/system/docs.ts index all agree.
 *
 * Runs as part of `npm run verify-ui`. Error messages say how to fix the drift.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const registry = JSON.parse(readFileSync(path.join(root, "registry.json"), "utf8"));
const docsIndex = readFileSync(path.join(root, "lib/system/docs.ts"), "utf8");

const errors = [];

for (const item of registry.items ?? []) {
  for (const file of item.files ?? []) {
    if (!existsSync(path.join(root, file.path))) {
      errors.push(
        `"${item.name}": registered file ${file.path} does not exist. Restore the file or remove the item from registry.json.`
      );
    }
  }

  if (!item.docs) {
    errors.push(
      `"${item.name}": no "docs" entry in registry.json. Add a colocated <name>.docs.tsx and point "docs" at it (see the component-library skill).`
    );
  } else if (!existsSync(path.join(root, item.docs))) {
    errors.push(
      `"${item.name}": docs file ${item.docs} does not exist. Create it (see the component-library skill) or fix the "docs" path.`
    );
  }

  // A doc maps under the bare name, or under "<surface>:<name>" when the item
  // shares its name with another entry (getDoc tries the qualified key first).
  const docKeys = [`"${item.name}":`];
  if (item.meta?.surface) docKeys.push(`"${item.meta.surface}:${item.name}":`);
  if (!docKeys.some((k) => docsIndex.includes(k))) {
    errors.push(
      `"${item.name}": not mapped in lib/system/docs.ts. Import its .docs.tsx and add a "${item.name}": (or "${item.meta?.surface ?? "<surface>"}:${item.name}":) entry to the docs map — otherwise it renders as "no docs yet".`
    );
  }

  // UX-doc completeness (ux-doc skill): a STABLE block or template may not ship
  // partial documentation — intent, interactions, states, and responsive are
  // required (templates also anatomy). Draft-grade work stays meta.status
  // "beta" (badged, exempt) or unregistered — nothing partial reads as done.
  const isStable = (item.meta?.status ?? "stable") === "stable";
  const tierRequired =
    item.type === "registry:block"
      ? ["intent", "interactions", "states", "responsive"]
      : item.type === "registry:page"
        ? ["intent", "anatomy", "interactions", "states", "responsive"]
        : [];
  if (isStable && tierRequired.length > 0 && item.docs && existsSync(path.join(root, item.docs))) {
    const docsSource = readFileSync(path.join(root, item.docs), "utf8");
    const missing = tierRequired.filter((field) => !new RegExp(`\\b${field}\\s*:`).test(docsSource));
    if (missing.length > 0) {
      errors.push(
        `"${item.name}": stable ${item.type === "registry:page" ? "template" : "block"} with incomplete UX docs — missing ${missing.join(", ")} in ${item.docs}. Author them per the ux-doc skill, or mark the item "meta": { "status": "beta" } until the docs are complete.`
      );
    }
  }
}

// Reverse direction: a colocated docs file whose component was never registered.
const registeredDocs = new Set((registry.items ?? []).map((i) => i.docs));
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "ui" || entry === "node_modules") continue; // vendored / deps
      yield* walk(full);
    } else if (entry.endsWith(".docs.tsx")) {
      yield path.relative(root, full);
    }
  }
}
// Templates colocate their docs with their route, so app/ is swept too.
for (const dir of ["components", "app"]) {
  for (const docsFile of walk(path.join(root, dir))) {
    if (!registeredDocs.has(docsFile)) {
      errors.push(
        `${docsFile}: colocated docs exist but the component is not in registry.json. Register it (component-library skill: pass the invention gate, add a registry item).`
      );
    }
  }
}

if (errors.length > 0) {
  console.error(`Registry drift — ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error(
    "\nSource of truth: registry.json ↔ component file ↔ <name>.docs.tsx ↔ lib/system/docs.ts must stay in sync."
  );
  process.exit(1);
}

console.log(`Registry clean: ${registry.items.length} items, files + docs + docs.ts index all in sync.`);
