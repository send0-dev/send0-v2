import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";
import { invalid } from "./errors";

/** zValidator that reports problems in our error format: the first issue, with its field as `param`. */
export const validate = <T extends ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) =>
  zValidator(target, schema, (result) => {
    if (!result.success) {
      const issue = result.error.issues[0];
      const param = issue?.path.join(".") || undefined;
      throw invalid(issue ? `${param ? `${param}: ` : ""}${issue.message}` : "Invalid request.", param);
    }
  });
