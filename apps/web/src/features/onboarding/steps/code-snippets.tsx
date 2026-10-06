import { CodeBlock } from "@/components/code-block";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** The same "wait for the next email" call in each language we ship an SDK for. */
export function CodeSnippets({ inboxId, apiKey }: { inboxId: string; apiKey: string }) {
  const snippets = {
    TypeScript: `import { Send0 } from "@send0/sdk";\n\nconst send0 = new Send0("${apiKey}");\nconst msg = await send0.inboxes.wait("${inboxId}", { timeout: 60 });\nconsole.log(msg?.extracted?.otp, msg?.extracted_text);`,
    Python: `from send0 import Send0\n\nsend0 = Send0("${apiKey}")\nmsg = send0.inboxes.wait("${inboxId}", timeout=60)\nprint(msg.extracted.otp, msg.extracted_text)`,
    cURL: `curl "https://api.send0.dev/v1/inboxes/${inboxId}/messages/wait?timeout=60" \\\n  -H "Authorization: Bearer ${apiKey}"`,
  };
  return (
    <Tabs defaultValue="TypeScript">
      <TabsList>
        {Object.keys(snippets).map((l) => (
          <TabsTrigger key={l} value={l}>
            {l}
          </TabsTrigger>
        ))}
      </TabsList>
      {Object.entries(snippets).map(([l, code]) => (
        <TabsContent key={l} value={l}>
          <CodeBlock code={code} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
