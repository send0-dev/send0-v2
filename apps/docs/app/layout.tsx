import localFont from "next/font/local";
import type { Metadata, Viewport } from "next";
import { Banner } from "fumadocs-ui/components/banner";
import { DocsLayout } from "fumadocs-ui/layouts/notebook";
import { Provider } from "@/components/provider";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";
import "./global.css";

const martian = localFont({
  src: "../node_modules/@fontsource-variable/martian-mono/files/martian-mono-latin-standard-normal.woff2",
  variable: "--font-martian",
  weight: "100 800",
  display: "swap",
  adjustFontFallback: false,
  declarations: [{ prop: "font-stretch", value: "75% 112.5%" }],
});
const host = localFont({
  src: "../node_modules/@fontsource-variable/host-grotesk/files/host-grotesk-latin-wght-normal.woff2",
  variable: "--font-host",
  weight: "300 800",
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://send0.dev"),
  title: { template: "%s · send0 docs", default: "send0 docs" },
  description: "Give any agent an email inbox in one API call. Guides, SDK, MCP and API reference for send0.",
  icons: { icon: "/docs/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#121116" },
  ],
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${martian.variable} ${host.variable}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col font-sans">
        <Provider>
          <Banner id="send0-beta-1" className="s0-banner">
            <span className="s0-banner-tag">API v1</span>
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
