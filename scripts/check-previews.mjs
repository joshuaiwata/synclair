#!/usr/bin/env node
/**
 * Preview coverage check — the machine-enforced half of the "no code-only
 * cards" rule. A library item that renders as a mono `<name />` placeholder
 * (or nothing but a snippet) is documentation fiction: the gallery claims a
 * component the browser never shows. Two guarantees:
 *
 *  1. Every NATIVE primitive in components/ui/ has an entry in
 *     components/library/native-previews.tsx (natives have no .docs.tsx, so
 *     that map is their only visual).
 *  2. Every registered docs module has at least one RENDERABLE example —
 *     `live(...)`, image, or embed — so neither the card nor the doc page
 *     degrades to code-only.
 *
 * Runs as part of `npm run verify-ui`. Error messages say how to fix it.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];

// 1. Native primitives ↔ native-previews map.
const uiDir = path.join(root, "components/ui");
const natives = readdirSync(uiDir)
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => f.replace(/\.tsx$/, ""));
const previewsSource = readFileSync(
  path.join(root, "components/library/native-previews.tsx"),
  "utf8"
);
for (const name of natives) {
  // Map keys are either bare (`badge:`) or quoted (`"input-group":`).
  const hasEntry = new RegExp(`^  (?:"${name}"|${name}): `, "m").test(previewsSource);
  if (!hasEntry) {
    errors.push(
      `native "${name}": no entry in components/library/native-previews.tsx — its gallery card and doc page render the <${name} /> code placeholder. Add a live() preview (portal-driven primitives render their real closed trigger).`
    );
  }
}

// 2. Registered docs modules must have at least one renderable example.
const registry = JSON.parse(readFileSync(path.join(root, "registry.json"), "utf8"));
for (const item of registry.items ?? []) {
  if (!item.docs || !existsSync(path.join(root, item.docs))) continue; // check:registry owns this
  const source = readFileSync(path.join(root, item.docs), "utf8");
  const renderable = /\blive\(|\bscene\(|\broute\(|kind:\s*"(?:image|embed)"/.test(source);
  if (!renderable) {
    errors.push(
      `"${item.name}": ${item.docs} has no renderable preview — every example is kind: "code", so the card and doc page show only snippets. Give at least one example a live()/scene()/image/embed preview.`
    );
  }
}

// 2b. Blocks and templates must render REAL — a wireframe or hand-mocked div is
//     not the block. The doc page proves it renders by (a) importing the item's
//     own module and rendering it live, (b) embedding its standalone preview
//     scene via scene() (self-referential blocks — see
//     components/library/preview-scenes.tsx), (c) embedding the running route
//     via route() (templates — the canonical path: the view IS a route), or
//     (d) a screenshot/embed. Wireframes belong in `anatomy`, never as the
//     only Example.
for (const item of registry.items ?? []) {
  if (item.type !== "registry:block" && item.type !== "registry:page") continue;
  if (!item.docs || !existsSync(path.join(root, item.docs))) continue;
  const tierLabel = item.type === "registry:page" ? "template" : "block";
  const source = readFileSync(path.join(root, item.docs), "utf8");
  const selfImport = (item.files ?? []).some((f) => {
    const spec = `@/${f.path.replace(/\.tsx?$/, "")}`;
    return source.includes(`from "${spec}"`);
  });
  const real =
    selfImport ||
    /\bscene\(|\broute\(/.test(source) ||
    /kind:\s*"(?:image|embed)"/.test(source);
  if (!real) {
    errors.push(
      `${tierLabel} "${item.name}": ${item.docs} never renders the real thing — no self-import, no scene()/route(), no image/embed. Its Examples are wireframes/mocks only. ${item.type === "registry:page" ? `Embed the running route with route("<path>")` : `Import the block and render it live, or register a standalone scene in components/library/preview-scenes.tsx and use scene("${item.name}")`}. Wireframes go in anatomy, not Examples.`
    );
  }
}

// 2c. scene("<name>") calls must have a registered scene — an embed of a 404
//     is a blank frame, the exact fiction this check exists to prevent.
const scenesPath = path.join(root, "components/library/preview-scenes.tsx");
const scenesSource = existsSync(scenesPath) ? readFileSync(scenesPath, "utf8") : "";
const sceneKeys = new Set(
  [...scenesSource.matchAll(/^  "([a-z0-9-]+)":/gm)].map((m) => m[1])
);
for (const item of registry.items ?? []) {
  if (!item.docs || !existsSync(path.join(root, item.docs))) continue;
  const source = readFileSync(path.join(root, item.docs), "utf8");
  for (const m of source.matchAll(/\bscene\(\s*"([^"]+)"/g)) {
    if (!sceneKeys.has(m[1])) {
      errors.push(
        `"${item.name}": ${item.docs} calls scene("${m[1]}") but components/library/preview-scenes.tsx has no "${m[1]}" entry — the doc page embeds a 404. Register the scene in the same change.`
      );
    }
  }
}

// 2d. route("<path>") calls must resolve to a real route in the app tree — an
//     embed of a 404 is a blank frame (same fiction as an unregistered scene).
//     Route groups `(group)` don't contribute URL segments; dynamic `[param]`
//     segments match any concrete value, so authors embed a real instantiation.
const appDir = path.join(root, "app");
const routePatterns = [];
(function collectRoutes(dir, segments) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      const seg = /^\(.*\)$/.test(entry) ? [] : [entry];
      collectRoutes(full, [...segments, ...seg]);
    } else if (/^page\.(tsx|ts|jsx|js|mdx)$/.test(entry)) {
      routePatterns.push(
        new RegExp(
          `^/${segments
            .map((s) => (/^\[.*\]$/.test(s) ? "[^/]+" : s.replace(/[.*+?^${}()|\\]/g, "\\$&")))
            .join("/")}/?$`
        )
      );
    }
  }
})(appDir, []);
const routeExists = (p) => routePatterns.some((re) => re.test(p.split(/[?#]/)[0]));
for (const item of registry.items ?? []) {
  if (!item.docs || !existsSync(path.join(root, item.docs))) continue;
  const source = readFileSync(path.join(root, item.docs), "utf8");
  for (const m of source.matchAll(/\broute\(\s*(?:synclair\(\s*)?"([^"]*)"/g)) {
    const p = m[0].includes("synclair(") ? `/synclair${m[1] === "/" ? "" : m[1]}` : m[1];
    if (!routeExists(p)) {
      errors.push(
        `"${item.name}": ${item.docs} calls route() for "${p}" but no app route matches — the doc page embeds a 404. Point it at an existing route (a concrete path for dynamic segments), or build the route first.`
      );
    }
  }
}

// 3. External (host) items: a live import, a rewrite port, or a screenshot —
//    the three honest preview paths (docs/rendering-parity.md). An entry with
//    none renders code-only: documentation the browser can't back up.
//    Upstreamed from a companion-clone spike, adapted for Path A live imports.
//
//    Stricter for BLOCKS/TEMPLATES on a WEB surface whose host is checked out:
//    a screenshot is a thumbnail, not a render — the doc page must show the
//    host's actual component running (live import or port). Non-web surfaces
//    (React Native etc.) and absent hosts keep the screenshot path.
const SHARED_SURFACE_ID = "shared";
const externalPath = path.join(root, "data/external-catalog.json");
const external = existsSync(externalPath)
  ? JSON.parse(readFileSync(externalPath, "utf8"))
  : { items: [] };

// Surface platforms from the seed (empty seed = single implicit web surface).
const surfacesSeedPath = path.join(root, "lib/system/seed/surfaces.ts");
const surfacesSeed = existsSync(surfacesSeedPath)
  ? readFileSync(surfacesSeedPath, "utf8")
  : "";
const surfacePlatforms = new Map(
  [...surfacesSeed.matchAll(/id:\s*"([^"]+)"[^}]*?platform:\s*"([^"]+)"/g)].map(
    (m) => [m[1], m[2]]
  )
);
const isWebSurface = (surfaceId) =>
  surfacePlatforms.size === 0 || surfacePlatforms.get(surfaceId) === "web";

// Path A live imports: statically scan components/host-previews/ for
// registered keys — hostPreviews["<name>"] or hostPreviews["<surface>:<name>"].
const hostPreviewsDir = path.join(root, "components", "host-previews");
let hostPreviewsSource = "";
if (existsSync(hostPreviewsDir)) {
  for (const f of readdirSync(hostPreviewsDir)) {
    if (/\.(tsx|ts)$/.test(f))
      hostPreviewsSource += readFileSync(path.join(hostPreviewsDir, f), "utf8");
  }
}
const hasLiveImport = (item) =>
  hostPreviewsSource.includes(`hostPreviews["${item.name}"]`) ||
  (item.surface && hostPreviewsSource.includes(`hostPreviews["${item.surface}:${item.name}"]`));

// Path B rewrite ports: a project-layer registered item owns the (surface, name).
const portedKeys = new Set(
  (registry.items ?? [])
    .filter((i) => i.meta?.layer === "project")
    .map((i) => `${i.meta?.surface ?? SHARED_SURFACE_ID}:${i.name}`)
);

const externalHosts = external.hosts ?? (external.host ? [external.host] : []);
const hostRootFor = (surfaceId) => {
  const h =
    externalHosts.find((x) => x.surface === surfaceId) ?? externalHosts[0];
  return h?.root;
};

for (const item of external.items ?? []) {
  const surfaceId = item.surface ?? externalHosts[0]?.surface ?? SHARED_SURFACE_ID;
  const key = `${item.surface ?? SHARED_SURFACE_ID}:${item.name}`;
  if (portedKeys.has(key)) continue; // rewrite port supersedes this entry
  if (hasLiveImport(item)) continue; // live import renders the real source

  // Web block/template with the host checked out: screenshots don't cut it —
  // the detail page must RENDER the block (the whole point of the library).
  const hostRoot = hostRootFor(surfaceId);
  const hostOnDisk = hostRoot && existsSync(path.resolve(root, hostRoot));
  const tier = item.kind === "block" || item.kind === "template";
  if (tier && hostOnDisk && isWebSurface(surfaceId)) {
    errors.push(
      `external "${key}" (${item.kind}): documented-only — a screenshot is a thumbnail, not a render. The host is on disk (${hostRoot}) and the surface is web: live-import it (port-host-component Path A) so its doc page renders the host's actual ${item.kind}.`
    );
    continue;
  }

  const hasImage = (item.examples ?? []).some((ex) => ex.image);
  if (!hasImage) {
    errors.push(
      `external "${key}" (${item.kind ?? "component"}): no live import, no port, no example screenshot — its doc page renders code-only. Live-import it (port-host-component Path A), port it, or add an examples[].image.`
    );
  }
}

// 4. Tailwind @source coverage for Path A live imports — the SILENT failure
//    mode. Tailwind v4 auto-scans only the hub's own tree; a host file imported
//    via @host/* lives outside it, so any utility class used ONLY there is
//    never generated. The component still renders — common classes resolve —
//    but its unique ones (centering, sizing, odd variants) no-op, and the
//    preview looks "almost right" with nothing in the console. Field case: an
//    avatar whose initials sat outside the circle because its absolute-centering
//    classes were used nowhere else. The fix is one `@source "<dir>"` in
//    app/globals.css per live-imported host tree; this check makes the gap loud.
//    Scope: direct @host imports of preview scenes (transitive host-internal
//    imports from a covered tree are almost always inside that same tree).
const globalsPath = path.join(root, "app/globals.css");
const globalsSource = existsSync(globalsPath) ? readFileSync(globalsPath, "utf8") : "";
const sourceRoots = [...globalsSource.matchAll(/@source\s+"([^"]+)"/g)].map((m) => {
  const beforeGlob = m[1].split(/[*{]/)[0]; // plain-dir prefix of any glob
  return path.resolve(path.dirname(globalsPath), beforeGlob);
});
let hostAliasTargets = [];
try {
  const tsconfig = JSON.parse(readFileSync(path.join(root, "tsconfig.json"), "utf8"));
  hostAliasTargets = (tsconfig.compilerOptions?.paths?.["@host/*"] ?? []).map((t) =>
    path.resolve(root, t.replace(/\/?\*$/, ""))
  );
} catch {
  /* no tsconfig / unparsable (jsonc comments): skip — typecheck owns that */
}
if (hostAliasTargets.length > 0 && existsSync(hostPreviewsDir)) {
  const uncovered = new Map(); // dir → [preview files]
  for (const f of readdirSync(hostPreviewsDir)) {
    // Scenes only (the skill's convention) — registry.tsx holds an @host import
    // in its doc comment, and comments aren't imports.
    if (!/\.preview\.(tsx|ts)$/.test(f)) continue;
    const src = readFileSync(path.join(hostPreviewsDir, f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const m of src.matchAll(/from\s+"@host\/([^"]+)"/g)) {
      const resolved = path.resolve(hostAliasTargets[0], m[1]);
      const dir = path.dirname(resolved);
      if (dir.startsWith(root + path.sep)) continue; // hub tree: auto-scanned
      // Dependencies are precompiled or the host build's concern — Tailwind
      // deliberately never scans node_modules, so neither do we.
      if (dir.split(path.sep).includes("node_modules")) continue;
      const covered = sourceRoots.some(
        (s) => dir === s || dir.startsWith(s + path.sep)
      );
      if (!covered) {
        if (!uncovered.has(dir)) uncovered.set(dir, []);
        if (!uncovered.get(dir).includes(f)) uncovered.get(dir).push(f);
      }
    }
  }
  for (const [dir, files] of uncovered) {
    const suggestion = path.relative(path.dirname(globalsPath), dir);
    errors.push(
      `host-previews: ${files.length} scene(s) (${files.join(", ")}) live-import from ${dir}, but no @source in app/globals.css covers it — Tailwind never scans that tree, so utilities used only there silently drop and the preview renders half-styled. Add: @source "${suggestion}";`
    );
  }
}

if (errors.length > 0) {
  console.error(`Preview coverage — ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error(
    "\nEvery library item must RENDER in the gallery — a code-only entry is a claim the browser can't back up."
  );
  process.exit(1);
}

console.log(
  `Previews covered: ${natives.length} native primitives + ${registry.items.length} registered + ${external.items?.length ?? 0} external items all render.`
);
