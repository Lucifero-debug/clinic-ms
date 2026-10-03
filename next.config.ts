import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Clinics run this on cheap Windows laptops over slow connections.
  // Keep the client bundle small — server components by default, and
  // resist adding client-side libraries.
  reactStrictMode: true,
};

export default nextConfig;
