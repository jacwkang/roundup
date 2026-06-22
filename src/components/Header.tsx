import { auth, signIn, signOut } from "@/lib/auth";

export async function Header() {
  const session = await auth();

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
        <a href="/" className="text-lg font-semibold tracking-tight">
          Hangout Planner
        </a>
        <nav className="flex items-center gap-4">
          {session?.user ? (
            <>
              <a href="/plans/new" className="text-sm text-muted hover:text-foreground">
                New plan
              </a>
              <span className="text-sm text-muted">{session.user.email}</span>
              <form
                action={async () => {
                  "use server";
                  await signOut();
                }}
              >
                <button
                  type="submit"
                  className="text-sm text-muted hover:text-foreground"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <form
              action={async () => {
                "use server";
                await signIn("google");
              }}
            >
              <button
                type="submit"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                Sign in with Google
              </button>
            </form>
          )}
        </nav>
      </div>
    </header>
  );
}
