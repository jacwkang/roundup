import { readConfig } from "@/lib/messaging/config";
export const dynamic = "force-dynamic";
export function GET() {
  try {
    const config = readConfig();
    return Response.json({ service: "ara", milestone: "M1", configured: true, chatAllowlistConfigured: config.allowedChatIds.length > 0 });
  } catch {
    return Response.json({ service: "ara", milestone: "M1", configured: false }, { status: 503 });
  }
}
