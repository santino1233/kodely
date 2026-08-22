"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { IconButton } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/* The one interactive element on the Domains page. Client only because the
   clipboard is. The failure branch is not decoration: writeText rejects on an
   insecure origin and in a few embedded browsers, and the customer has to end
   up with the address either way — so the toast carries the text itself
   rather than saying "copy failed" and leaving them with nothing. */
export function CopyAddress({ url, siteName }: { url: string; siteName: string }) {
  const push = useToast();
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
        push({ tone: "ok", message: `Address for ${siteName} copied.` });
      },
      () => {
        push({ tone: "danger", message: `Couldn't reach the clipboard. The address is ${url}` });
      },
    );
  }

  return (
    <IconButton
      label={copied ? `Copied the address for ${siteName}` : `Copy the address for ${siteName}`}
      variant="ghost"
      size="sm"
      onClick={copy}
    >
      {copied ? (
        <Check className="size-4 text-ok" aria-hidden />
      ) : (
        <Copy className="size-4" aria-hidden />
      )}
    </IconButton>
  );
}
