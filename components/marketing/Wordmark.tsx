import { Logo } from "./Logo";

export function Wordmark({ className = "" }: { className?: string }) {
  return <Logo className={className} />;
}
