import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "slit-gorged-decibel.ngrok-free.dev",
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "localhost",
    "127.0.0.1",
    "10.38.190.89",
  ],
  experimental: {
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
