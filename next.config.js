/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Baked in at build time; the Dockerfile passes these from CI (GitVersion semver + git SHA).
  env: {
    APP_VERSION: process.env.APP_VERSION || 'dev',
    GIT_SHA: (process.env.GIT_SHA || 'unknown').slice(0, 7),
  },
};

module.exports = nextConfig;
