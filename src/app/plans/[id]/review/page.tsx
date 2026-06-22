import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getPlanWithParticipants } from "@/lib/plans/service";
import { ReviewPageClient } from "@/components/ReviewPageClient";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }

  const { id } = await params;
  const data = await getPlanWithParticipants(id);

  if (!data || data.plan.organizerId !== session.user.id) {
    notFound();
  }

  return (
    <ReviewPageClient planId={id} planTitle={data.plan.title} />
  );
}
