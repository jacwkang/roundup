import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const slot = request.nextUrl.searchParams.get("slot") ?? "1";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>You're in!</title></head>
      <body style="font-family: system-ui; max-width: 480px; margin: 4rem auto; text-align: center;">
        <h1>You're in for Option ${slot}!</h1>
        <p>Thanks for confirming. The organizer has been notified.</p>
        <p><a href="${appUrl}/plans/${id}">View plan</a></p>
      </body>
    </html>
  `;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
