import { hasRole, requireSession } from "@/lib/server/auth-guard";
import {
  getAutomationSettings,
  isCampaignWorkerEnabled,
  upsertAutomationSettings,
} from "@/lib/journey/automation-settings";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const settings = await getAutomationSettings();
    return Response.json({
      settings,
      capabilities: {
        workerEnabled: isCampaignWorkerEnabled(),
      },
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/automation/toggle] Database unavailable; returning degraded response.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}

export async function PATCH(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const workerEnabled = isCampaignWorkerEnabled();
  const update = {};

  if (body.enabled !== undefined) update.enabled = body.enabled;
  if (workerEnabled) {
    update.executionMode = "WORKER";
  } else if (body.executionMode !== undefined) {
    const mode = String(body.executionMode || "").trim().toUpperCase();
    if (mode === "WORKER") {
      return Response.json(
        { error: "Campaign worker mode is disabled by environment." },
        { status: 400 }
      );
    }
    update.executionMode = mode;
  }
  if (body.maxRetries !== undefined) update.maxRetries = body.maxRetries;
  if (body.batchSize !== undefined) update.batchSize = body.batchSize;
  if (body.concurrency !== undefined) update.concurrency = body.concurrency;
  if (body.dailyCap !== undefined) update.dailyCap = body.dailyCap;
  if (body.workingHoursStart !== undefined) update.workingHoursStart = body.workingHoursStart;
  if (body.workingHoursEnd !== undefined) update.workingHoursEnd = body.workingHoursEnd;
  if (body.timezone !== undefined) update.timezone = body.timezone;
  if (body.eligibleStatuses !== undefined) update.eligibleStatuses = body.eligibleStatuses;

  try {
    const settings = await upsertAutomationSettings(update);

    return Response.json({
      settings,
      capabilities: {
        workerEnabled,
      },
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/automation/toggle] Database unavailable during settings update.");
      return databaseUnavailableResponse();
    }

    throw error;
  }
}
