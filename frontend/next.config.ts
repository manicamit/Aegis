import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // FASTAPI_URL is read server-side in route handlers via process.env.FASTAPI_URL
  // Set in .env.local: FASTAPI_URL=http://localhost:8000
};

export default nextConfig;
