// Shared props type for the Sign in with Apple button
export type AppleSignInButtonProps = {
  onError: (message: string | null) => void;
  onSuccess: () => void;
};
