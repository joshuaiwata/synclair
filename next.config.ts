import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Pin the workspace root: a stray lockfile in the home directory otherwise
  // makes Turbopack infer the home directory as the project root.
  //
  // Co-located clones (`co-locate-synclair`) need the root ABOVE this directory
  // instead, so live-imported host files are inside it — see that skill.
  turbopack: { root: import.meta.dirname },
}

export default nextConfig
