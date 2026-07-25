/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  output: "export",

  // Optional: Change links `/me` -> `/me/` and emit `/me.html` -> `/me/index.html`
  trailingSlash: true,

  // Optional: Prevent automatic `/me` -> `/me/`, instead preserve `href`
  skipTrailingSlashRedirect: true,

  // Optional: Change the output directory `out` -> `dist`
  distDir: "dist",


  // assetPrefix: isProd ? "/balance" : "",
  // Dev: serve at root `/`; Production build: serve under `/balance`
  basePath: isProd ? "/balance" : "",
};

export default nextConfig;
