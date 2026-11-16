import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // `next dev` hängt sonst bei jedem Start einen Hinweis-Block für
  // KI-Agenten an CLAUDE.md an. Die Projektregeln pflegen wir selbst.
  agentRules: false,
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
