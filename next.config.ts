import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Pin the workspace root: a stray lockfile in the home directory otherwise
  // makes Turbopack infer /Users/hal as the project root.
  turbopack: { root: import.meta.dirname },
}

export default nextConfig
