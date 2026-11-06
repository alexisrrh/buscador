import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // PDF.js resolves its worker relative to its package, not a Turbopack chunk.
  serverExternalPackages: ["pdfmake", "pdf-parse", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", "./node_modules/@napi-rs/canvas*/**/*"],
  },
  async headers() {
    return [{
      source: "/models/bv-01/BV01_clean_blue_visor_base.glb",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    }, {
      source: "/models/bv-01/BV01_runtime_poster.webp",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    }];
  },
};

export default nextConfig;
