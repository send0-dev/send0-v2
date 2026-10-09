import defaultMdxComponents from "fumadocs-ui/mdx";
import { Callout } from "fumadocs-ui/components/callout";
import { Card } from "fumadocs-ui/components/card";
import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { TypeTable } from "fumadocs-ui/components/type-table";
import type { ComponentProps } from "react";
import type { MDXComponents } from "mdx/types";

const calloutTags = { info: "i", tip: "i", note: "i", warn: "!", warning: "!", error: "×", success: "✓", idea: "*" } as const;

function S0Callout({ type = "info", ...props }: ComponentProps<typeof Callout>) {
  const tag = calloutTags[type as keyof typeof calloutTags] ?? "i";
  return (
    <Callout
      type={type}
      {...props}
      className="s0-callout"
      icon={
        <span className="s0-callout-tag" aria-hidden="true">
          [{tag}]
        </span>
      }
    />
  );
}

function S0Pre({ title, children, ...props }: ComponentProps<typeof CodeBlock>) {
  return (
    <CodeBlock {...props} title={typeof title === "string" && title ? `[ ${title} ]` : title} className="s0-code">
      <Pre>{children}</Pre>
    </CodeBlock>
  );
}

function S0Tabs(props: ComponentProps<typeof Tabs>) {
  return <Tabs {...props} className="s0-tabs" />;
}

function S0Card(props: ComponentProps<typeof Card>) {
  return <Card {...props} className="s0-card" />;
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    pre: S0Pre,
    Callout: S0Callout,
    Card: S0Card,
    Step,
    Steps,
    Tab,
    Tabs: S0Tabs,
    TypeTable,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
