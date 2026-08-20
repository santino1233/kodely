import Link from "next/link";
import { Logo } from "@/components/marketing/Logo";
import { Aura } from "@/components/marketing/Aura";
import { AuthWallpaper } from "@/components/marketing/AuthWallpaper";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50 lg:grid-cols-2">
      <AuthWallpaper />

      <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
        <Aura />
        <div className="relative w-full max-w-sm">
          <Link href="/" className="mb-6 flex justify-center">
            <Logo markSize={26} className="text-lg" />
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
