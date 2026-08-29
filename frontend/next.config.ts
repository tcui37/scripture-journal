import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

// Build-time. Set API_URL on the Vercel frontend project to the API origin
// (no trailing slash). Local default is the FastAPI dev server.
const apiUrl = (process.env.API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const here = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // A lockfile in a parent folder (home, monorepo root) otherwise becomes
  // Next's "workspace root", and `next build` looks for `app/` in the wrong
  // place — that is what broke the Vercel production build.
  outputFileTracingRoot: here,
  async rewrites() {
    // Browser calls stay same-origin; only /api/:path* is proxied (so
    // /api/health warms the Python function, while /health on this origin is 404).
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
