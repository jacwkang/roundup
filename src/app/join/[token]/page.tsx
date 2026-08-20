import { JoinPageClient } from "@/components/JoinPageClient";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <JoinPageClient shareToken={token} />;
}
