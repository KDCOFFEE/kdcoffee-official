import type { NextConfig } from "next";

const qaOutputDirectory = "qa-output";
const nextConfig: NextConfig = {
  // Preserve Next 16.4.3's default list and keep LINE previews in the initial head.
  htmlLimitedBots: /[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight|Line\/|LineBot/i,
  // Local verification JSON must never enter server deployment traces.
  outputFileTracingExcludes: {
    "*": [`./${qaOutputDirectory}/**/*`, "./dependency-install.log"],
  },
  compiler: {
    // Next 16's route excludes do not cover the separate instrumentation NFT.
    runAfterProductionCompile: async ({ distDir, projectDir }) => {
      const fs = await import("node:fs/promises"), path = await import("node:path");
      const traceFile = path.join(distDir, "server", "instrumentation.js.nft.json");
      const trace = JSON.parse(await fs.readFile(/* turbopackIgnore: true */ traceFile, "utf8")) as { version: number; files: string[] };
      if (!Array.isArray(trace.files)) throw new Error("Invalid instrumentation trace.");
      trace.files = trace.files.filter(file => {
        const relative = path.relative(projectDir, path.resolve(path.dirname(traceFile), file));
        return relative !== qaOutputDirectory && !relative.startsWith(qaOutputDirectory + path.sep);
      });
      await fs.writeFile(/* turbopackIgnore: true */ traceFile, JSON.stringify(trace));
    },
  },
  allowedDevOrigins: [
    "slit-gorged-decibel.ngrok-free.dev",
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "localhost",
    "127.0.0.1",
    "10.38.190.89",
  ],
  experimental: {
    authInterrupts: true,
    serverActions: {
      allowedOrigins: [
        "slit-gorged-decibel.ngrok-free.dev",
        "*.ngrok-free.dev",
        "*.ngrok-free.app",
        "localhost:3000",
        "127.0.0.1:3000",
      ],
    },
  },
};

export default nextConfig;
