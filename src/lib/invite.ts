import { SignJWT, jwtVerify } from "jose";

function getSecret() {
  const secret = process.env.AUTH_SECRET ?? "dev-secret-change-me";
  return new TextEncoder().encode(secret);
}

export async function createInviteToken(
  participantId: string,
  planId: string
): Promise<string> {
  return new SignJWT({ participantId, planId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(getSecret());
}

export async function verifyInviteToken(token: string): Promise<{
  participantId: string;
  planId: string;
}> {
  const { payload } = await jwtVerify(token, getSecret());
  const participantId = payload.participantId as string;
  const planId = payload.planId as string;
  if (!participantId || !planId) {
    throw new Error("Invalid invite token");
  }
  return { participantId, planId };
}
