import { Check, X } from "lucide-react";
import { PASSWORD_RULES, passwordScore, passwordLabel } from "@/lib/password-strength";

const BAR_COLORS = ["bg-red-500", "bg-red-500", "bg-amber-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-500"];

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const score = passwordScore(password);

  return (
    // id so the password field can point aria-describedby at this. The rule
    // list is what a screen-reader user needs; the coloured bars are the
    // same information as the "Weak/Strong" label beside them, so they are
    // hidden rather than read out as six anonymous elements.
    <div
      id="password-strength"
      className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex items-center gap-2">
        <div aria-hidden className="flex flex-1 gap-1">
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
              // Contrast: emerald-600 was 3.8:1 on this panel and
              // neutral-400 / dark:neutral-600 were ~2.4:1 — both under AA
              // for 11px text. emerald-700 / neutral-500 / neutral-400 clear
              // it while keeping the met-vs-unmet distinction identical.
              className={`flex items-center gap-1.5 text-[11px] ${
                met ? "text-emerald-700 dark:text-emerald-400" : "text-neutral-500 dark:text-neutral-400"
              }`}
            >
              {/* The icon repeats what the "met"/"not met" wording below
                  already conveys via colour+glyph, so it is decoration. */}
              {met ? (
                <Check size={11} strokeWidth={3} aria-hidden />
              ) : (
                <X size={11} strokeWidth={2.5} aria-hidden />
              )}
              <span className="sr-only">{met ? "Met:" : "Not met:"}</span>
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
