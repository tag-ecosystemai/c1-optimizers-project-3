import path from "node:path";
import type { NextConfig } from "next";

// public/attio.html stays reachable at /attio.html as the visual reference.
const nextConfig: NextConfig = {
  // The repo root has its own package-lock.json; pin Turbopack to this app instead of guessing.
  turbopack: { root: path.join(__dirname) },
};

export default nextConfig;
