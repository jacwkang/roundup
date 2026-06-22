import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { encryptToken } from "@/lib/crypto/tokens";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!account?.providerAccountId || !user.email) return false;

      const db = getDb();
      const existing = await db.query.users.findFirst({
        where: eq(users.googleId, account.providerAccountId),
      });

      const encryptedRefresh = account.refresh_token
        ? encryptToken(account.refresh_token)
        : existing?.encryptedRefreshToken ?? null;

      if (existing) {
        await db
          .update(users)
          .set({
            name: user.name ?? existing.name,
            email: user.email,
            encryptedRefreshToken: encryptedRefresh,
          })
          .where(eq(users.id, existing.id));
      } else {
        await db.insert(users).values({
          id: uuidv4(),
          email: user.email,
          name: user.name ?? null,
          googleId: account.providerAccountId,
          encryptedRefreshToken: encryptedRefresh,
        });
      }

      return true;
    },
    async session({ session, token }) {
      if (session.user?.email) {
        const db = getDb();
        const dbUser = await db.query.users.findFirst({
          where: eq(users.email, session.user.email),
        });
        if (dbUser) {
          session.user.id = dbUser.id;
        }
      }
      if (token.sub) {
        session.user = session.user ?? {};
        session.user.id = token.sub;
      }
      return session;
    },
    async jwt({ token, account }) {
      if (account?.providerAccountId) {
        const db = getDb();
        const dbUser = await db.query.users.findFirst({
          where: eq(users.googleId, account.providerAccountId),
        });
        if (dbUser) {
          token.sub = dbUser.id;
        }
      } else if (token.email) {
        const db = getDb();
        const dbUser = await db.query.users.findFirst({
          where: eq(users.email, token.email as string),
        });
        if (dbUser) {
          token.sub = dbUser.id;
        }
      }
      return token;
    },
  },
  pages: {
    signIn: "/",
  },
  session: { strategy: "jwt" },
  trustHost: true,
});
