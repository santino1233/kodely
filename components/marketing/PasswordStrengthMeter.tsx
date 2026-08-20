import { Check, X } from "lucide-react";
import { PASSWORD_RULES, passwordScore, passwordLabel } from "@/lib/password-strength";

const BAR_COLORS = ["bg-red-500", "bg-red-500", "bg-amber-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-500"];

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const score = passwordScore(password);

  return (
    <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {PASSWORD_RULES.map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < score ? BAR_COLORS[score] : "bg-neutral-200 dark:bg-neutral-800"
              }`}
            />
          ))}
        </div>
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{passwordLabel(score)}</span>
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
        {PASSWORD_RULES.map((rule) => {
          const met = rule.test(password);
          return (
            <li
              key={rule.key}
              className={`flex items-center gap-1.5 text-[11px] ${
                met ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-400 dark:text-neutral-600"
              }`}
            >
              {met ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={2.5} />}
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
