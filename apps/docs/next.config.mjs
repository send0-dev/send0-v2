import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  // Static export, served from send0.dev/docs by a Worker with static assets.
  output: 'export',
  basePath: '/docs',
  reactStrictMode: true,
  images: { unoptimized: true },
};

export default withMDX(config);
