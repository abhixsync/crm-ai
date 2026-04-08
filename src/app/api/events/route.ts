export const dynamic = "force-dynamic";

import { requireSession, getTenantContext } from "@/lib/server/auth-guard";
import { createRedisSubscriber } from "@/lib/events/event-publisher";

export async function GET(request: Request) {
  const auth = await requireSession();
  if (auth.error) return new Response("Unauthorized", { status: 401 });

  const tenant = getTenantContext(auth.session, request);
  const tenantId = tenant?.tenantId;
  if (!tenantId) return new Response("Tenant required", { status: 400 });

  const channel = `realtime:${tenantId}`;
  const subscriber = createRedisSubscriber();

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();

      // 30s keepalive ping — prevents proxy timeouts
      const pingTimer = setInterval(() => {
        try { controller.enqueue(enc.encode(": ping\n\n")); } catch {}
      }, 30_000);

      // 5-minute safety valve — browser EventSource auto-reconnects
      const safetyTimer = setTimeout(async () => {
        await cleanup();
        try { controller.close(); } catch {}
      }, 5 * 60 * 1000);

      async function cleanup() {
        clearInterval(pingTimer);
        clearTimeout(safetyTimer);
        if (subscriber) {
          try { await subscriber.unsubscribe(channel); } catch {}
          try { await subscriber.quit(); } catch {}
        }
      }

      if (subscriber) {
        await subscriber.subscribe(channel);
        subscriber.on("message", (_ch: string, message: string) => {
          try {
            controller.enqueue(enc.encode(`data: ${message}\n\n`));
          } catch {}
        });
      }

      // Cleanup on client disconnect
      request.signal.addEventListener("abort", async () => {
        await cleanup();
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
