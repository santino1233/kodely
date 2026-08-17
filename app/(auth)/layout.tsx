import Link from "next/link";
import { Logo } from "@/components/marketing/Logo";
import { Aura } from "@/components/marketing/Aura";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-white px-4 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <Aura />
      <Link href="/" className="absolute left-6 top-6 z-10">
        <Logo markSize={22} className="text-[15px]" />
      </Link>
      <div className="relative w-full max-w-sm">{children}</div>
    </div>
  );
}
