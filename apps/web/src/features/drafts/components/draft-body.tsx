import type { Draft } from "@send0/sdk";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HtmlPreview } from "@/features/messages/components/html-preview";

const Text = ({ text }: { text: string | null }) => (
  <pre className="max-h-56 overflow-y-auto rounded-md bg-muted/60 p-3 font-sans text-[13px] leading-relaxed whitespace-pre-wrap">{text ?? "(no text version)"}</pre>
);

/**
 * What a reviewer approves. When the draft has an HTML version, that's what most recipients
 * will see, so it's shown too: approving on the text alone could send HTML nobody read.
 */
export function DraftBody({ draft }: { draft: Draft }) {
  if (!draft.html) return <Text text={draft.text} />;
  return (
    <Tabs defaultValue="html">
      <TabsList>
        <TabsTrigger value="html">HTML (what recipients see)</TabsTrigger>
        <TabsTrigger value="text">Text</TabsTrigger>
      </TabsList>
      <TabsContent value="html">
        <HtmlPreview html={draft.html} className="h-72" />
      </TabsContent>
      <TabsContent value="text">
        <Text text={draft.text} />
      </TabsContent>
    </Tabs>
  );
}
