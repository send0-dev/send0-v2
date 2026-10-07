import { Geist, Geist_Mono } from "next/font/google";
import type { Metadata } from "next";
import { Banner } from "fumadocs-ui/components/banner";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { Provider } from "@/components/provider";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";
import "./global.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  metadataBase: new URL("https://send0.dev"),
  title: { template: "%s · send0 docs", default: "send0 docs" },
  description: "Give any agent an email inbox in one API call. Guides, SDK, MCP and API reference for send0.",
  // Metadata URLs don't get basePath automatically.
  icons: { icon: "/docs/favicon.svg" },
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col font-sans">
        <Provider>
          <Banner id="send0-beta-1" className="font-mono text-xs">
            <span className="mr-2 rounded border border-fd-border px-1.5 py-0.5">API v1</span>
            Private beta. The API is stable; send limits are low while the shared domain warms up.
          </Banner>
          <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
            {children}
          </DocsLayout>
        </Provider>
      </body>
    </html>
  );
}
