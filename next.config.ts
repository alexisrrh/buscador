import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // PDF.js resolves its worker relative to its package, not a Turbopack chunk.
  serverExternalPackages: ["pdfmake", "pdf-parse", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", "./node_modules/@napi-rs/canvas*/**/*"],
  },
};

export default nextConfig;
