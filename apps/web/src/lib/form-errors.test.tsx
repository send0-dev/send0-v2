import { act, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { AppError } from "./api";
import { applyServerError } from "./form-errors";

/** react-hook-form only tracks formState fields that are read during render. */
const useTrackedForm = () => {
  const form = useForm({ defaultValues: { email: "" } });
  void form.formState.errors;
  return form;
};

describe("applyServerError", () => {
  it("puts a field error on the matching input", () => {
    const { result } = renderHook(() => useForm({ defaultValues: { email: "", password: "" } }));
    applyServerError(result.current, new AppError(400, "disposable_email", "No throwaway addresses.", "email"));
    expect(result.current.getFieldState("email").error?.message).toBe("No throwaway addresses.");
  });

  it("uses the form-level error when the field isn't in the form", () => {
    const { result } = renderHook(() => useTrackedForm());
    act(() => applyServerError(result.current, new AppError(429, "rate_limited", "Too many attempts.")));
    expect(result.current.formState.errors.root?.server?.message).toBe("Too many attempts.");
  });

  it("explains network failures", () => {
    const { result } = renderHook(() => useTrackedForm());
    act(() => applyServerError(result.current, new TypeError("Failed to fetch")));
    expect(result.current.formState.errors.root?.server?.message).toMatch(/Can't reach send0/);
  });
});
