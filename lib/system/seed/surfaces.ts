import type { Surface } from "../surfaces"

/**
 * Per-project app SURFACES — the distinct frontends this project ships
 * (e.g. a responsive web app + a React Native companion app sharing a backend).
 *
 * Seed (§8): declared once at bootstrap/intake and reviewed by a human, like
 * `project.ts`. LEAVE EMPTY for a single-frontend project — an empty list means
 * one implicit surface and Synclair shows zero multi-surface chrome (today's UI
 * exactly). Declare two or more entries only when the project genuinely has
 * separate frontends with separate component sets.
 *
 * Example (monorepo host with web + Expo apps):
 *
 *   export const SURFACES: Surface[] = [
 *     { id: "web",    label: "Web app",       platform: "web",          root: "../acme/apps/web",    framework: "Next.js 15" },
 *     { id: "mobile", label: "Companion app", platform: "react-native", root: "../acme/apps/mobile", framework: "Expo SDK 52" },
 *   ]
 */
export const SURFACES: Surface[] = []
