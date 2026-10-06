import { useMutation } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { useResetSession } from "@/features/session/api/use-session-actions";

/** Each of these changes who is signed in (or their stage), so the session is reloaded afterwards. */
export function useLogIn() {
  const reset = useResetSession();
  return useMutation({ mutationFn: authClient.logIn, onSuccess: reset });
}

export function useSignUp() {
  const reset = useResetSession();
  return useMutation({ mutationFn: authClient.signUp, onSuccess: reset });
}

export function useVerifyEmail() {
  const reset = useResetSession();
  return useMutation({ mutationFn: authClient.verifyEmail, onSuccess: reset });
}

export function useResetPassword() {
  const reset = useResetSession();
  return useMutation({ mutationFn: authClient.resetPassword, onSuccess: reset });
}

export function useForgotPassword() {
  return useMutation({ mutationFn: authClient.forgotPassword });
}

export function useResendVerification() {
  return useMutation({ mutationFn: authClient.resendVerification });
}
