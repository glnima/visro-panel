import type { NextConfig } from "next";

// NEXT_PUBLIC_DEMO=1 builds the static GitHub Pages demo: no server, the API
// runs in the browser (src/demo). Route handlers are .ts files, so limiting
// page extensions to .tsx leaves the server API out of that build.
const demo = process.env.NEXT_PUBLIC_DEMO === "1";

const nextConfig: NextConfig = {
  ...(demo
    ? {
        output: "export",
        trailingSlash: true,
        basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
        pageExtensions: ["tsx"],
        images: { unoptimized: true },
      }
    : {
        cacheComponents: true,
        partialPrefetching: true,
      }),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
