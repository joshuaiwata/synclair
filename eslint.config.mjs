import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Foundation guardrails — the machine-enforced version of the router's rules
 * (AGENTS.md → "Styling" / "Two app UIs"). The error messages are written for
 * whoever wrote the line, human or AI agent: they say what to use instead.
 *
 * Note: flat config REPLACES a rule's entry when a later block sets the same
 * rule — it does not merge. So all selectors live in one block, and the
 * sanctioned homes of raw values get narrow override blocks below:
 *   - lib/system/tokens.ts + lib/system/seed/** document literal values
 *   - lib/system/routes.ts defines the /synclair mount point itself
 *   - components/ui/** is vendored shadcn code (upstream idiom, updated by CLI)
 */

const TOKEN_SELECTORS = [
  {
    selector: "Literal[value=/\\u005B#[0-9a-fA-F]{3,8}\\u005D/]",
    message:
      "Raw hex color in a class string (e.g. bg-[#22c55e]). Use a semantic token from lib/system/tokens.ts instead (bg-secondary, text-muted-foreground, …) — the vocabulary is browsable at /synclair/foundations. If no token fits, add one to app/globals.css + tokens.ts rather than hardcoding.",
  },
  {
    selector: "TemplateElement[value.raw=/\\u005B#[0-9a-fA-F]{3,8}\\u005D/]",
    message:
      "Raw hex color in a class template string. Use a semantic token from lib/system/tokens.ts instead (bg-secondary, text-muted-foreground, …). If no token fits, add one to app/globals.css + tokens.ts rather than hardcoding.",
  },
  {
    selector: "Literal[value=/\\u005B[0-9]+([.][0-9]+)?px\\u005D/]",
    message:
      "Arbitrary pixel value in a class string (e.g. p-[13px], text-[11px]). Use the spacing/type scale from lib/system/tokens.ts (p-3, p-4, text-2xs, text-3xs, …). If the scale genuinely lacks a step, add a token to app/globals.css + tokens.ts instead.",
  },
  {
    selector: "TemplateElement[value.raw=/\\u005B[0-9]+([.][0-9]+)?px\\u005D/]",
    message:
      "Arbitrary pixel value in a class template string. Use the spacing/type scale from lib/system/tokens.ts (p-3, p-4, text-2xs, text-3xs, …). If the scale genuinely lacks a step, add a token to app/globals.css + tokens.ts instead.",
  },
  {
    selector: "JSXAttribute[name.name='style'] Literal[value=/#[0-9a-fA-F]{3,8}/]",
    message:
      "Raw hex color in an inline style. Use a Tailwind class backed by a semantic token (lib/system/tokens.ts); if an inline style is unavoidable, reference the token via var(--token-name).",
  },
];

const ROUTE_SELECTORS = [
  {
    selector: "Literal[value=/^\\u002Fsynclair(\\u002F|$)/]",
    message:
      "Hardcoded '/synclair' path. Import { synclair } from '@/lib/system/routes' and use synclair() / synclair('/subpath') — the hub mount point (SYNCLAIR_BASE) must stay relocatable.",
  },
  {
    selector: "TemplateElement[value.raw=/^\\u002Fsynclair\\u002F/]",
    message:
      "Hardcoded '/synclair' path in a template string. Import { synclair } from '@/lib/system/routes' and use synclair('/subpath') — the hub mount point (SYNCLAIR_BASE) must stay relocatable.",
  },
];

const SURFACE_SELECTORS = [
  {
    // A className that draws a box (rounded + standalone `border`) but sets no
    // background. Doc previews render on the stage-canvas (bg-card + dot
    // grid), so a transparent box inherits the stage color and reads as a
    // bare outline over the dots — an item must never share its container's
    // background.
    selector:
      "JSXAttribute[name.name='className'] Literal[value=/^(?=.*(?:^|\\s)rounded)(?=.*(?:^|\\s)border(?:\\s|$))(?!.*bg-).*$/]",
    message:
      "Bordered demo box with no background — on the dot-grid stage-canvas it inherits the stage color and reads as a bare outline. Give it a surface token (bg-background for stand-ins on the stage, bg-muted for muted-state demos); use bg-transparent only if see-through is the point.",
  },
];

const foundationGuardrails = {
  files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
  ignores: ["components/ui/**"],
  rules: {
    "no-restricted-syntax": ["error", ...TOKEN_SELECTORS, ...ROUTE_SELECTORS],
  },
};

// Docs modules author demo stand-ins rendered on the tinted preview canvas —
// they additionally get the surface-contrast rule. (Flat config replaces, so
// the token + route selectors are repeated here.)
const docsSurfaceGuardrail = {
  files: ["app/**/*.docs.tsx", "components/**/*.docs.tsx", "lib/**/*.docs.tsx"],
  rules: {
    "no-restricted-syntax": ["error", ...TOKEN_SELECTORS, ...ROUTE_SELECTORS, ...SURFACE_SELECTORS],
  },
};

// Sanctioned homes of raw values: token rules off, route rules still on.
const tokenSourceExemption = {
  files: ["lib/system/tokens.ts", "lib/system/seed/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-syntax": ["error", ...ROUTE_SELECTORS],
  },
};

// The mount-point definition itself: route rules off, token rules still on.
const routeSourceExemption = {
  files: ["lib/system/routes.ts"],
  rules: {
    "no-restricted-syntax": ["error", ...TOKEN_SELECTORS],
  },
};

// .cjs files are CommonJS by contract (e.g. Turbopack loaders, which must be
// require()-land) — the ESM-import rule doesn't apply to them.
const commonJsExemption = {
  files: ["**/*.cjs"],
  rules: {
    "@typescript-eslint/no-require-imports": "off",
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  foundationGuardrails,
  docsSurfaceGuardrail,
  tokenSourceExemption,
  routeSourceExemption,
  commonJsExemption,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
