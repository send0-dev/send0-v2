import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  // Static export, served from send0.dev/docs by a Worker with static assets.
  output: "export",
  basePath: "/docs",
  reactStrictMode: true,
  images: { unoptimized: true },
  // next dev writes AGENTS.md and CLAUDE.md when it detects a coding agent; the repo has its own.
  agentRules: false,
};

export default withMDX(config);
