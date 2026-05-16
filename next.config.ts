import type { NextConfig } from "next";
import path from "path";

// #region agent log
fetch("http://127.0.0.1:7800/ingest/fd631e72-4665-4122-b32e-2df0088c7344", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "5dfb08" }, body: JSON.stringify({ sessionId: "5dfb08", runId: "initial", hypothesisId: "H1-dev-config", location: "next.config.ts:4", message: "Next config module evaluated", data: { hasTurbopackRoot: true }, timestamp: Date.now() }) }).catch(() => {});
// #endregion

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
