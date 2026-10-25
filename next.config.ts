import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local verification JSON must never enter server deployment traces.
  outputFileTracingExcludes: {
    "*": ["./qa-output/**/*", "./dependency-install.log"],
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
