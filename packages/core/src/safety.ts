export type InjectionLevel = "none" | "suspected" | "likely";

export interface Safety {
  promptInjection: InjectionLevel;
  /** Short machine-readable reasons, e.g. ["instruction_override", "hidden_text"] */
  reasons: string[];
}

const SIGNALS: { reason: string; weight: number; re: RegExp }[] = [
  {
    reason: "instruction_override",
    weight: 3,
    re: /\b(?:ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}\b(?:all |any |the |your )?(?:previous|prior|above|earlier|preceding|system|original)\b[^.\n]{0,20}\b(?:instructions?|prompts?|rules|directions|guidelines|messages?)\b/i,
  },
  {
    reason: "role_reassignment",
    weight: 2,
    // Not plain "you are now": that's every "you are now subscribed" email.
    re: /\b(?:you are now (?:a|an|the|in)\b[^.\n]{0,30}\b(?:assistant|ai|agent|bot|model|mode|persona)|from now on,? you (?:are|will|must)|pretend (?:to be|you are)|roleplay as)\b/i,
  },
  {
    reason: "system_prompt_probe",
    weight: 2,
    re: /\b(?:system prompt|developer message|your (?:hidden |secret )?instructions|reveal (?:your|the) (?:prompt|instructions))\b/i,
  },
  {
    reason: "fake_role_tags",
    weight: 3,
    re: /<\/?(?:system|assistant|user|im_start|im_end)>|\[\/?INST\]|<<\/?SYS>>|^\s*(?:system|assistant)\s*:/im,
  },
  {
    reason: "exfiltration_request",
    weight: 2,
    re: /\b(?:send|forward|email|post|upload|share)\b[^.\n]{0,60}\b(?:api[_ ]?keys?|passwords?|credentials|secrets?|tokens?|private keys?|all (?:emails|messages|files|contacts))\b/i,
  },
  {
    reason: "tool_invocation",
    weight: 2,
    re: /\b(?:call|invoke|run|execute|use) (?:the )?(?:tool|function)\b|"(?:tool_call|function_call)"\s*:/i,
  },
  {
    reason: "urgent_agent_address",
    weight: 1,
    re: /\b(?:AI|LLM|assistant|agent|chatbot|language model)\b[^.\n]{0,30}\b(?:must|should|need to|are required to|immediately)\b/i,
  },
];

/**
 * Heuristic prompt-injection flag for inbound mail. Cheap, explainable, and tuned to avoid
 * flagging normal business mail; a classifier can replace or back it later.
 * `hiddenText` is text a human reader can't see in the HTML; instructions hidden there weigh more.
 */
export function detectPromptInjection(visibleText: string, hiddenText = ""): Safety {
  const reasons: string[] = [];
  let score = 0;
  for (const s of SIGNALS) {
    const inVisible = s.re.test(visibleText);
    const inHidden = hiddenText ? s.re.test(hiddenText) : false;
    if (inVisible || inHidden) {
      reasons.push(s.reason);
      score += s.weight + (inHidden ? 2 : 0);
    }
  }
  if (hiddenText.trim().length > 0 && reasons.length > 0) reasons.push("hidden_text");
  const promptInjection: InjectionLevel = score >= 4 ? "likely" : score >= 2 ? "suspected" : "none";
  return { promptInjection, reasons };
}
