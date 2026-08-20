/**
 * CLAIM ANCHORS — does this digest still say something its source supports?
 *
 * Freshness answers "did the file move". It cannot answer "is this sentence
 * still true", and those come apart constantly: a digest can be perfectly
 * anchored to an unmoved file and still describe a decision that was reversed in
 * a section it never cited. Worse, the two failures look identical on the page —
 * fluent prose, no warning.
 *
 * So a digest may cite the passages it was written from. Each anchor names a
 * source file, a heading, and the hash of that heading's body AT DISTILL TIME.
 * Verification re-hashes and reports a verdict. Pure string work: no model, no
 * network, no git required — which is what makes it runnable in `verify-ui` and
 * on a hook.
 *
 * THREE VERDICTS, and the middle one is the point:
 *
 *   exact       the passage is byte-identical (after whitespace normalisation)
 *   fuzzy       it changed, but still says substantially the same thing
 *   unverified  the passage is gone, or the source is
 *
 * A `fuzzy` verdict is not a failure. Specs get reworded constantly without
 * changing meaning, and a checker that flagged every reflow would be turned off
 * within a week. It is a *lower confidence*, not an alarm.
 *
 * WE REPORT, WE DO NOT DELETE. The audited implementation clears an ungrounded
 * field outright. That suits a machine-read index; it is wrong for a hub a human
 * reads, where a claim that quietly vanishes is less recoverable than one
 * labelled "we can no longer confirm this".
 */

import { existsSync, readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"

import { sections, splitFrontmatter } from "./local-source.mjs"

const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16)

/** Same normalisation the local-source hasher uses, so the two agree by construction. */
const normalise = (body) =>
  body
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

/** Words that carry meaning, for the fuzzy comparison. */
const STOP = new Set(
  "the a an and or of to in for on at by is are was were be been it its this that these those with as from not no".split(" ")
)
const tokens = (s) =>
  new Set(
    normalise(s)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  )

/**
 * CONTAINMENT, not Jaccard: what fraction of the QUOTE's meaningful words still
 * appear in the passage.
 *
 * Jaccard was the obvious choice and it is wrong here, because the two sides are
 * not comparable in size — a one-line quote against a ten-line section scores
 * 0.40 even when every word of the quote is still present, purely because the
 * section says more. That misread a plain rewording as a reversal.
 *
 * The question this needs to answer is one-directional: is what the claim rested
 * on still in there? So the denominator is the quote alone.
 *
 * The limit is worth stating: this measures PRESENCE, not meaning. "Seats are
 * billed monthly" and "seats are not billed monthly" score identically, so a
 * `fuzzy` verdict means "a human should glance at this", never "this is fine".
 */
export function overlap(quote, passage) {
  const A = tokens(quote)
  const B = tokens(passage)
  if (A.size === 0) return B.size === 0 ? 1 : 0
  let shared = 0
  for (const t of A) if (B.has(t)) shared++
  return shared / A.size
}

/**
 * Parse an `anchors:` list out of a digest's YAML frontmatter.
 *
 * Deliberately a hand-rolled reader for one flat shape rather than a YAML
 * dependency: the foundation must work in any clone with zero install, which is
 * the same constraint that kept the MCP server dependency-free.
 *
 *   ---
 *   anchors:
 *     - source: .prds/Billing_PRD.md
 *       section: Pricing
 *       hash: 3f2a1b0c9d8e7f60
 *   ---
 */
export function parseAnchors(text) {
  const { frontmatter } = splitFrontmatter(text ?? "")
  if (!frontmatter) return []
  const lines = frontmatter.split("\n")
  const start = lines.findIndex((l) => /^anchors:\s*$/.test(l))
  if (start === -1) return []

  const out = []
  let cur = null
  for (const raw of lines.slice(start + 1)) {
    // A new top-level key ends the block.
    if (/^[A-Za-z_][\w-]*:/.test(raw)) break
    if (/^\s*---\s*$/.test(raw)) break
    const item = /^\s*-\s+(\w+):\s*(.*)$/.exec(raw)
    if (item) {
      if (cur) out.push(cur)
      cur = { [item[1]]: unquote(item[2]) }
      continue
    }
    const field = /^\s+(\w+):\s*(.*)$/.exec(raw)
    if (field && cur) cur[field[1]] = unquote(field[2])
  }
  if (cur) out.push(cur)
  return out.filter((a) => a.source && a.section)
}

const unquote = (v) => v.trim().replace(/^['"]|['"]$/g, "")

/** The body of a named heading in a source file, or null. */
export function sectionBody(text, heading) {
  const found = sections(text).find((s) => s.heading === heading)
  return found ? found.body : null
}

/**
 * Verify one anchor against the source on disk.
 *
 * @param repoRoot base for the anchor's `source` path (the PRODUCT repo)
 * @returns {{verdict: "exact"|"fuzzy"|"unverified", detail: string|null, overlap?: number}}
 */
export function verifyAnchor(repoRoot, anchor) {
  const abs = path.join(repoRoot, anchor.source)
  if (!existsSync(abs)) {
    return { verdict: "unverified", detail: `source ${anchor.source} is not on disk` }
  }
  let text
  try {
    text = readFileSync(abs, "utf8")
  } catch {
    return { verdict: "unverified", detail: `source ${anchor.source} could not be read` }
  }

  const body = sectionBody(text, anchor.section)
  if (body === null) {
    // A heading that no longer exists is the strongest signal there is: whatever
    // this claim rested on has been renamed or removed outright.
    return { verdict: "unverified", detail: `“${anchor.section}” is no longer a heading in ${anchor.source}` }
  }

  const now = sha(normalise(body))

  /**
   * THE QUOTE IS WHAT MAKES THIS A GROUNDING GATE.
   *
   * A hash only says the passage changed; it cannot say whether what the claim
   * RESTED ON survived. A verbatim quote can: it is still there, it was reworded
   * but still says the same thing, or it is gone. That is the whole difference
   * between "this document moved" and "this sentence is no longer supported".
   */
  if (anchor.quote) {
    const hay = normalise(body).toLowerCase()
    if (hay.includes(normalise(anchor.quote).toLowerCase())) {
      return { verdict: "exact", detail: null, overlap: 1 }
    }
    const ov = overlap(anchor.quote, body)
    if (ov >= 0.6) {
      return {
        verdict: "fuzzy",
        overlap: ov,
        // Not an alarm. Specs get reworded constantly without changing meaning,
        // and a checker that shouted at every reflow gets switched off.
        // Presence, not meaning — see `overlap`. Worth a glance, not an alarm.
        detail: `reworded since it was cited; the cited terms are still present (${ov.toFixed(2)}) — confirm it still means what the digest says`,
      }
    }
    return {
      verdict: "unverified",
      overlap: ov,
      detail: `the cited passage is no longer in “${anchor.section}” (overlap ${ov.toFixed(2)})`,
    }
  }

  if (!anchor.hash) {
    // Cited but never anchored. Not a failure — work not yet done, and saying so
    // beats inventing a verdict from a hash we never recorded.
    return { verdict: "unverified", detail: "no hash or quote recorded — run `check:anchors --update`" }
  }
  if (now === anchor.hash) return { verdict: "exact", detail: null }

  /**
   * Section changed and there is no quote to re-check. We genuinely cannot tell
   * whether the claim survived, so we say that rather than guessing `fuzzy` —
   * an unearned "probably fine" is the failure mode this whole mechanism exists
   * to remove.
   */
  return {
    verdict: "unverified",
    detail: `“${anchor.section}” changed and this anchor records no quote — add one to tell a reword from a reversal`,
  }
}

/** Recompute an anchor's hash from the source as it stands now. */
export function currentHash(repoRoot, anchor) {
  const abs = path.join(repoRoot, anchor.source)
  if (!existsSync(abs)) return null
  const body = sectionBody(readFileSync(abs, "utf8"), anchor.section)
  return body === null ? null : sha(normalise(body))
}

/** Rewrite a digest's frontmatter hashes in place, leaving everything else alone. */
export function reanchor(text, repoRoot) {
  const anchors = parseAnchors(text)
  if (anchors.length === 0) return { text, updated: 0 }
  let out = text
  let updated = 0
  for (const a of anchors) {
    const h = currentHash(repoRoot, a)
    if (!h) continue
    if (a.hash === h) continue
    if (a.hash) {
      out = out.replace(new RegExp(`(hash:\\s*)${a.hash}`), `$1${h}`)
    } else {
      /**
       * Insert a hash line directly after this anchor's `section:` line.
       *
       * The trailing `\s*` this used to end with was greedy across the newline,
       * so the inserted line fused onto the next one and produced
       * `hash: <sha>quote: '...'` — which then parsed as a hash with no quote,
       * and silently downgraded a verified claim to unverified. Match the line
       * ending explicitly, and reuse the file's own indent.
       */
      const re = new RegExp(
        `(\\n([ \\t]+)section:[ \\t]*['"]?${escapeRe(a.section)}['"]?[ \\t]*\\r?\\n)`
      )
      out = out.replace(re, `$1$2hash: ${h}\n`)
    }
    updated++
  }
  return { text: out, updated }
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
