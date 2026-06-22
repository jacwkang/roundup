import { auth, signIn } from "@/lib/auth";
import Link from "next/link";

export default async function HomePage() {
  const session = await auth();

  return (
    <div className="space-y-8">
      <section className="space-y-4 pt-8">
        <h1 className="text-4xl font-bold tracking-tight">
          Plan hangouts that actually happen
        </h1>
        <p className="text-lg text-muted max-w-xl">
          Connect Google Calendar, find times everyone is free, discover restaurants
          and local events, and send a proposal email — all in one place.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-semibold">How it works</h2>
        <ol className="list-decimal list-inside space-y-2 text-muted">
          <li>Create a hangout plan and invite friends by email</li>
          <li>Friends connect their Google Calendar via invite link</li>
          <li>We find mutual free time and suggest restaurants & events</li>
          <li>Review AI suggestions and send a proposal email</li>
        </ol>
      </section>

      {session?.user ? (
        <Link
          href="/plans/new"
          className="inline-block rounded-lg bg-accent px-6 py-3 font-medium text-white hover:bg-accent-hover"
        >
          Create a hangout plan
        </Link>
      ) : (
        <form
          action={async () => {
            "use server";
            await signIn("google");
          }}
        >
          <button
            type="submit"
            className="rounded-lg bg-accent px-6 py-3 font-medium text-white hover:bg-accent-hover"
          >
            Get started with Google
          </button>
        </form>
      )}

      <p className="text-xs text-muted">
        We only read free/busy calendar data — not your event details.{" "}
        <Link href="/privacy" className="underline">
          Privacy
        </Link>
      </p>
    </div>
  );
}
