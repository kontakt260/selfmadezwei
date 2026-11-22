import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import path from "path";
import { assertBuildConfig } from "./src/lib/config/build-config";
import { buildSecurityHeaders } from "./src/lib/config/security-headers";

export default function createNextConfig(phase: string): NextConfig {
  // PROJ-19: Eine fehlerhafte Konfiguration geht gar nicht erst live.
  if (phase === PHASE_PRODUCTION_BUILD) assertBuildConfig(process.env);

  const securityHeaders = buildSecurityHeaders({
    isDevelopment: phase === PHASE_DEVELOPMENT_SERVER,
    isDeployed: Boolean(process.env.VERCEL),
  });

  return {
    // `next dev` hängt sonst bei jedem Start einen Hinweis-Block für
    // KI-Agenten an CLAUDE.md an. Die Projektregeln pflegen wir selbst.
    agentRules: false,
    poweredByHeader: false,
    turbopack: {
      root: path.resolve(__dirname),
    },
    async headers() {
      return [{ source: "/(.*)", headers: securityHeaders }];
    },
  };
}
