export const PASSWORD_RULES = [
  { key: "length", label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { key: "upper", label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { key: "lower", label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { key: "number", label: "One number", test: (p: string) => /[0-9]/.test(p) },
  { key: "symbol", label: "One symbol", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

export function passwordScore(password: string): number {
  return PASSWORD_RULES.reduce((n, rule) => n + (rule.test(password) ? 1 : 0), 0);
}

export function passwordLabel(score: number): string {
  if (score <= 1) return "Weak";
  if (score <= 3) return "Fair";
  if (score === 4) return "Good";
  return "Strong";
}
