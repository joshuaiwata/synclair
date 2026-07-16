import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import ts from "typescript"

import type { DocProp } from "./doc-types"

/**
 * DERIVED props for host components — the Storybook-docgen move applied to
 * companion mode (docs/rendering-parity.md). Storybook's props tables can't
 * drift because nobody writes them: they're computed from source at build time.
 * This module does the same for external catalog entries: when the host repo is
 * on disk, the Props table on a host item's doc page is derived from the host's
 * actual TypeScript on read — always current by construction. The authored
 * `props` in data/external-catalog.json remain only as the fallback for
 * machines where the host isn't checked out (e.g. CI).
 *
 * Deliberately conservative: any failure (no tsconfig, unresolvable types, no
 * component found) returns null and the caller falls back to authored props.
 * A wrong derivation would be worse than a stale one.
 */

interface CacheEntry {
  /** sha256 of the source file the derivation was computed from. */
  hash: string
  props: DocProp[] | null
}

/** Per-process cache — a program per file is ~100s of ms; repeat reads are free. */
const derivedCache = new Map<string, CacheEntry>()

const MAX_PROPS = 40
const MAX_TYPE_LENGTH = 120

/**
 * Props inherited from React's own DOM/aria surface (HTMLAttributes etc.) are
 * noise — hundreds of DOM props would bury the component's real API. Only
 * React's type packages are filtered: props contributed by other libraries
 * (cva's VariantProps → `variant`/`size`, Radix's `open`/`onOpenChange`) ARE
 * the component's API and stay. These pass-through names are the exception to
 * the React filter: universal, and readers expect them.
 */
const REACT_TYPES = /node_modules\/(@types\/react\b|csstype)/
const REACT_ALLOWLIST = new Set(["children", "className", "asChild", "style"])

function fileHash(abs: string): string {
  return createHash("sha256").update(readFileSync(abs)).digest("hex")
}

/** "data-table" / "data_table" → "DataTable", for matching the file's primary export. */
function pascalFromBasename(abs: string): string {
  return path
    .basename(abs)
    .replace(/\.(tsx|jsx|ts|js)$/, "")
    .split(/[-_.]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("")
}

function compilerOptionsFor(abs: string, hostRootAbs: string): ts.CompilerOptions {
  // The host's own tsconfig supplies path aliases (`@/…`) and JSX settings so
  // imports resolve the way they do in the host build. Overrides keep the
  // program cheap and side-effect free.
  const overrides: ts.CompilerOptions = {
    noEmit: true,
    skipLibCheck: true,
    // Don't demand every @types package the host lists; we never typecheck.
    types: [],
    allowJs: true,
  }
  const configPath = ts.findConfigFile(path.dirname(abs), ts.sys.fileExists, "tsconfig.json")
  let options: ts.CompilerOptions | null = null
  if (configPath && configPath.startsWith(hostRootAbs)) {
    const config = ts.readConfigFile(configPath, ts.sys.readFile)
    if (!config.error) {
      options = ts.parseJsonConfigFileContent(
        config.config,
        ts.sys,
        path.dirname(configPath),
        overrides,
        configPath
      ).options
    }
  }
  options ??= {
    ...overrides,
    jsx: ts.JsxEmit.Preserve,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  }
  // Host checked out but deps not installed (fresh clone, CI): bare imports
  // (cva, radix) can't resolve, and props contributed by their types (e.g.
  // VariantProps → `variant`/`size`) silently vanish. Fall back to the HUB's
  // node_modules for type resolution — shadcn hosts share the same core deps.
  // Only when the host's own node_modules is absent; theirs always wins when present.
  if (!existsSync(path.join(hostRootAbs, "node_modules"))) {
    const hubModules = path.join(process.cwd(), "node_modules")
    options.paths = {
      ...(options.paths ?? {}),
      // react/react-dom ship untyped; under a paths mapping TS won't fall back
      // to @types on its own, so map them there explicitly (before the wildcard).
      react: [path.join(hubModules, "@types/react")],
      "react/*": [path.join(hubModules, "@types/react/*")],
      "react-dom": [path.join(hubModules, "@types/react-dom")],
      "react-dom/*": [path.join(hubModules, "@types/react-dom/*")],
      "*": [path.join(hubModules, "*")],
    }
    options.baseUrl ??= hostRootAbs
  }
  return options
}

/** The exported component declaration to document: named like the file, else the first PascalCase export. */
function findComponent(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  preferredName: string
): ts.Symbol | undefined {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile)
  if (!moduleSymbol) return undefined
  const exports = checker.getExportsOfModule(moduleSymbol)
  const componentish = exports.filter((s) => /^[A-Z]/.test(s.getName()) || s.getName() === "default")
  return (
    componentish.find((s) => s.getName() === preferredName) ??
    componentish.find((s) => s.getName() === "default") ??
    componentish[0]
  )
}

function declaredOnlyInReactTypes(symbol: ts.Symbol): boolean {
  const decls = symbol.getDeclarations()
  // No declarations = synthesized (e.g. mapped types) — keep.
  if (!decls || decls.length === 0) return false
  return decls.every((d) => REACT_TYPES.test(d.getSourceFile().fileName))
}

/** Default values from the component's destructured-param initializers, e.g. `({ size = "md" })`. */
function destructuredDefaults(decl: ts.Declaration | undefined): Map<string, string> {
  const defaults = new Map<string, string>()
  if (!decl) return defaults
  let params: ts.NodeArray<ts.ParameterDeclaration> | undefined
  if (ts.isFunctionDeclaration(decl) || ts.isFunctionExpression(decl) || ts.isArrowFunction(decl)) {
    params = decl.parameters
  } else if (ts.isVariableDeclaration(decl) && decl.initializer) {
    let init: ts.Expression = decl.initializer
    // Unwrap forwardRef(...)/memo(...) to the inner function.
    while (ts.isCallExpression(init) && init.arguments.length > 0) {
      const inner = init.arguments[0]
      if (ts.isFunctionExpression(inner) || ts.isArrowFunction(inner)) {
        init = inner
        break
      }
      break
    }
    if (ts.isFunctionExpression(init) || ts.isArrowFunction(init)) params = init.parameters
  }
  const first = params?.[0]
  if (first && ts.isObjectBindingPattern(first.name)) {
    for (const el of first.name.elements) {
      if (el.initializer && ts.isIdentifier(el.name)) {
        defaults.set(el.name.text, el.initializer.getText().slice(0, 60))
      }
    }
  }
  return defaults
}

function propsOfComponent(
  componentSymbol: ts.Symbol,
  checker: ts.TypeChecker,
  location: ts.Node
): DocProp[] | null {
  const decl = componentSymbol.getDeclarations()?.[0]
  const type = checker.getTypeOfSymbolAtLocation(componentSymbol, decl ?? location)
  const signatures = type.getCallSignatures()
  if (signatures.length === 0) return null
  const param = signatures[0].getParameters()[0]
  if (!param) return [] // takes no props
  const propsType = checker.getTypeOfSymbolAtLocation(param, decl ?? location)
  const defaults = destructuredDefaults(decl)

  const props: DocProp[] = []
  for (const p of checker.getPropertiesOfType(propsType)) {
    const propName = p.getName()
    if (propName.startsWith("__")) continue
    if (propName.startsWith("aria-") || propName.startsWith("data-")) continue
    if (declaredOnlyInReactTypes(p) && !REACT_ALLOWLIST.has(propName)) continue
    const propDecl = p.getDeclarations()?.[0]
    const propType = checker.getTypeOfSymbolAtLocation(p, propDecl ?? location)
    let typeText = checker.typeToString(propType, undefined, ts.TypeFormatFlags.NoTruncation)
    if (typeText.length > MAX_TYPE_LENGTH) typeText = `${typeText.slice(0, MAX_TYPE_LENGTH)}…`
    const optional = (p.flags & ts.SymbolFlags.Optional) !== 0
    props.push({
      name: optional ? `${propName}?` : propName,
      type: typeText,
      default: defaults.get(propName),
      description: ts.displayPartsToString(p.getDocumentationComment(checker)) || undefined,
    })
    if (props.length >= MAX_PROPS) break
  }
  return props
}

/**
 * Derive the props table for a host component from its live source.
 * Returns null when the file is missing or anything about the derivation
 * fails — callers fall back to the catalog's authored props.
 */
export function deriveHostProps(hostRootAbs: string, hostPath: string): DocProp[] | null {
  const abs = path.resolve(hostRootAbs, hostPath)
  // Never follow a hostPath outside the host root.
  if (!abs.startsWith(hostRootAbs) || !existsSync(abs)) return null
  try {
    const hash = fileHash(abs)
    const cached = derivedCache.get(abs)
    if (cached && cached.hash === hash) return cached.props

    const program = ts.createProgram([abs], compilerOptionsFor(abs, hostRootAbs))
    const checker = program.getTypeChecker()
    const sourceFile = program.getSourceFile(abs)
    if (!sourceFile) return remember(abs, hash, null)

    const componentSymbol = findComponent(sourceFile, checker, pascalFromBasename(abs))
    if (!componentSymbol) return remember(abs, hash, null)

    const props = propsOfComponent(componentSymbol, checker, sourceFile)
    return remember(abs, hash, props && props.length > 0 ? props : null)
  } catch {
    return null
  }
}

function remember(abs: string, hash: string, props: DocProp[] | null): DocProp[] | null {
  derivedCache.set(abs, { hash, props })
  return props
}
