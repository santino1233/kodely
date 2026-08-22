import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";

/* The builder sits OUTSIDE the portal shell on purpose — it is full-bleed chat
   plus preview, and a 248px nav rail would eat a fifth of the customer's
   preview. But `AppShell` is also what mounts the toast host for every other
   product screen, so without this layout `useToast()` would throw the moment
   anything in here tried to confirm a publish or a restore.

   Deliberately nothing else. No background, no padding, no chrome: this layout
   also wraps /projects/[id]/submissions and /projects/[id]/preview, and a
   wrapper that painted a surface would change both of them. */
export default function ProjectLayout({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
