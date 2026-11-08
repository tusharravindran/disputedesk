"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50"
      onClick={async () => {
        setBusy(true);
        await fetch("/api/disputes/sync", { method: "POST" });
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? "Syncing…" : "Sync from PayPal"}
    </button>
  );
}
