import { hasRole, requireSession } from "@/lib/server/auth-guard";
import {
  getAutomationSettings,
  upsertAutomationSettings,
} from "@/lib/journey/automation-settings";

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await getAutomationSettings();
  return Response.json({ settings });
}

export async function PATCH(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const update = {};

  if (body.enabled !== undefined) update.enabled = body.enabled;
  if (body.maxRetries !== undefined) update.maxRetries = body.maxRetries;
  if (body.batchSize !== undefined) update.batchSize = body.batchSize;
  if (body.concurrency !== undefined) update.concurrency = body.concurrency;
  if (body.dailyCap !== undefined) update.dailyCap = body.dailyCap;
  if (body.workingHoursStart !== undefined) update.workingHoursStart = body.workingHoursStart;
  if (body.workingHoursEnd !== undefined) update.workingHoursEnd = body.workingHoursEnd;
  if (body.timezone !== undefined) update.timezone = body.timezone;
  if (body.eligibleStatuses !== undefined) update.eligibleStatuses = body.eligibleStatuses;

  const settings = await upsertAutomationSettings(update);

  return Response.json({ settings });
}
