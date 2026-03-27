import { prisma } from "@/lib/prisma";
import { requireSession, hasRole } from "@/lib/server/auth-guard";

async function checkDatabase() {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "healthy", latency: Date.now() - start, lastChecked: new Date().toISOString() };
  } catch {
    return { status: "down", latency: Date.now() - start, lastChecked: new Date().toISOString(), details: "Database connection failed" };
  }
}

async function checkAiEngine() {
  const start = Date.now();
  try {
    const config = await prisma.aiProviderConfig.findFirst({ where: { status: "ACTIVE" } });
    return {
      status: config ? "healthy" : "degraded",
      latency: Date.now() - start,
      lastChecked: new Date().toISOString(),
      details: config ? `Provider: ${config.name}` : "No active AI provider configured",
    };
  } catch {
    return { status: "down", latency: Date.now() - start, lastChecked: new Date().toISOString(), details: "Could not query AI config" };
  }
}

async function checkTelephony() {
  const start = Date.now();
  try {
    const config = await prisma.telephonyProviderConfig.findFirst({ where: { enabled: true, isActive: true } });
    return {
      status: config ? "healthy" : "degraded",
      latency: Date.now() - start,
      lastChecked: new Date().toISOString(),
      details: config ? `Provider: ${config.name}` : "No active telephony provider configured",
    };
  } catch {
    return { status: "down", latency: Date.now() - start, lastChecked: new Date().toISOString(), details: "Could not query telephony config" };
  }
}

async function checkQueue() {
  const start = Date.now();
  try {
    const pending = await prisma.campaignJob.count({ where: { status: "QUEUED" } });
    const active = await prisma.campaignJob.count({ where: { status: "ACTIVE" } });
    return {
      status: "healthy",
      latency: Date.now() - start,
      lastChecked: new Date().toISOString(),
      details: `${pending} queued, ${active} active`,
    };
  } catch {
    return { status: "down", latency: Date.now() - start, lastChecked: new Date().toISOString(), details: "Could not query job queue" };
  }
}

function checkEmail() {
  const start = Date.now();
  const configured = !!(process.env.SMTP_HOST || process.env.EMAIL_SERVER_HOST);
  return {
    status: configured ? "healthy" : "degraded",
    latency: Date.now() - start,
    lastChecked: new Date().toISOString(),
    details: configured ? "SMTP configured" : "No SMTP configured",
  };
}

async function checkWebhooks() {
  const start = Date.now();
  try {
    const active = await prisma.webhookConfig.count({ where: { enabled: true } });
    return {
      status: "healthy",
      latency: Date.now() - start,
      lastChecked: new Date().toISOString(),
      details: `${active} active webhook(s)`,
    };
  } catch {
    return { status: "down", latency: Date.now() - start, lastChecked: new Date().toISOString(), details: "Could not query webhooks" };
  }
}

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [database, ai_engine, telephony, queue, webhooks] = await Promise.all([
    checkDatabase(),
    checkAiEngine(),
    checkTelephony(),
    checkQueue(),
    checkWebhooks(),
  ]);

  return Response.json({
    database,
    ai_engine,
    telephony,
    queue,
    email: checkEmail(),
    webhooks,
  });
}
