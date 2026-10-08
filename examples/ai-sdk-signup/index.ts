/**
 * An agent gets its own inbox, waits for a sign-up email and reads the code out of it.
 *
 *   SEND0_API_KEY=s0_… ANTHROPIC_API_KEY=sk-ant-… pnpm start
 *
 * When the address is printed, sign up somewhere with it (or just email it a code).
 */
import { anthropic } from "@ai-sdk/anthropic";
import { send0Tools } from "@send0/ai-sdk";
import { generateText, stepCountIs } from "ai";

const { text } = await generateText({
  model: anthropic("claude-opus-5-5"),
  // Reading only: this agent has no reason to send mail.
  tools: send0Tools({ include: ["create_inbox", "wait_for_email"] }),
  stopWhen: stepCountIs(5),
  prompt:
    "Create an inbox for a sign-up. Then wait up to 5 minutes (timeout 300) for a verification email, " +
    "and tell me who sent it and the one-time code or verification link.",
  onStepEnd: ({ toolResults }) => {
    for (const r of toolResults) console.log(`\n[${r.toolName}]\n${String(r.output)}`);
  },
});

console.log(`\n${text}`);
