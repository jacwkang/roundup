"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";

export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    params.then((p) => setToken(p.token));
  }, [params]);

  useEffect(() => {
    if (!token || status === "loading") return;

    if (status === "unauthenticated") {
      signIn("google", { callbackUrl: `/invite/${token}` });
      return;
    }

    if (session?.user && !joining) {
      setJoining(true);
      fetch(`/api/invite/${token}`, { method: "POST" })
        .then((r) => r.json())
        .then((data) => {
          if (data.planId) {
            router.push(`/plans/${data.planId}`);
          } else if (data.needsAuth) {
            signIn("google", { callbackUrl: `/invite/${token}` });
          } else {
            setError(data.error ?? "Failed to join plan");
          }
        })
        .catch(() => setError("Failed to join plan"));
    }
  }, [token, session, status, router, joining]);

  return (
    <div className="text-center space-y-4 pt-16">
      <h1 className="text-xl font-semibold">Joining hangout plan...</h1>
      <p className="text-muted">
        {status === "loading" || joining
          ? "Connecting your Google Calendar..."
          : "Redirecting..."}
      </p>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}
