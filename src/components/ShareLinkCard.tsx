"use client";

import { useState } from "react";

export function ShareLinkCard({ inviteUrl }: { inviteUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border-2 border-accent/30 bg-accent/5 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold">Invite link</p>
        <p className="text-xs text-muted mt-1">
          Send this in your group chat. Friends sign in, share preferences, and vote here.
        </p>
      </div>
      <div className="rounded-lg bg-card border border-border px-3 py-2 text-sm break-all font-mono">
        {inviteUrl}
      </div>
      <button
        type="button"
        onClick={copyLink}
        className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-white touch-manipulation"
      >
        {copied ? "Copied!" : "Copy invite link"}
      </button>
    </div>
  );
}
