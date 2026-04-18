import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks (declared before any imports that use them) ───────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    campaign:           { findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    campaignJob:        { groupBy: vi.fn() },
    customer:           { count: vi.fn() },
    user:               { findUnique: vi.fn(), findFirst: vi.fn() },
    subscriptionConfig: { findUnique: vi.fn(async () => null) },
    tenant:             { findFirst: vi.fn(async () => null) },
    automationSetting:  {
      findFirst:  vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
      update:     vi.fn(async () => ({})),
      create:     vi.fn(async () => ({})),
    },
  },
}));

vi.mock("@/lib/journey/automation-runner", () => ({
  runAutomationBatch: vi.fn(async () => ({
    ok: true,
    status: 200,
    data: { queued: 0, attempted: 0 },
  })),
}));

vi.mock("@/lib/email/mailer", () => ({
  sendEmail:                    vi.fn(async () => ({ ok: true })),
  buildCampaignCompletionEmail: vi.fn(() => ({
    subject:  "Campaign Done",
    html:     "<p>done</p>",
    text:     "done",
    fromName: null,
  })),
}));

vi.mock("@/modules/theme/theme.service", () => ({
  resolveTenantTheme: vi.fn(async () => null),
}));

vi.mock("@/lib/server/auth-guard", () => ({
  requireSession: vi.fn(async () => ({
    session: { role: "SUPER_ADMIN", tenantId: null },
    error:   null,
  })),
}));

vi.mock("@/lib/journey/automation-settings", () => ({
  isCampaignWorkerEnabled:        vi.fn(() => false),
  getAutomationSettings:          vi.fn(async () => ({})),
  resolveAutomationExecutionMode: vi.fn(() => "CRON"),
}));

vi.mock("@/lib/server/database-error", () => ({
  isDatabaseUnavailable:       vi.fn(() => false),
  databaseUnavailableResponse: vi.fn(() =>
    Response.json({ error: "db_unavailable" }, { status: 503 })
  ),
}));

vi.mock("@/lib/notifications/notification-service", () => ({
  createNotification: vi.fn().mockResolvedValue({}),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { prisma }                                   from "@/lib/prisma";
import { runAutomationBatch }                       from "@/lib/journey/automation-runner";
import { sendEmail, buildCampaignCompletionEmail }  from "@/lib/email/mailer";
import { isCampaignWorkerEnabled,
         resolveAutomationExecutionMode,
         getAutomationSettings }                    from "@/lib/journey/automation-settings";
import { GET }                                      from "@/app/api/cron/ai-campaign/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockReq(headers = {}) {
  return { headers: { get: (k) => headers[k] ?? null } };
}

async function callGet(extraHeaders = {}) {
  const req = mockReq({ "x-cron-secret": "test-secret", ...extraHeaders });
  const res = await GET(req);
  const body = await res.json();
  return { res, body };
}

/** Let fire-and-forget microtasks (checkAndNotifyCampaignCompletion) settle. */
function settle() {
  return new Promise((r) => setTimeout(r, 50));
}

// ─── beforeEach ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  process.env.CRON_SECRET = "test-secret";

  // Re-apply defaults after clearAllMocks wipes implementations
  isCampaignWorkerEnabled.mockReturnValue(false);
  resolveAutomationExecutionMode.mockReturnValue("CRON");
  getAutomationSettings.mockResolvedValue({});

  runAutomationBatch.mockResolvedValue({
    ok: true, status: 200, data: { queued: 0, attempted: 0 },
  });
  buildCampaignCompletionEmail.mockReturnValue({
    subject: "s", html: "h", text: "t", fromName: null,
  });
  sendEmail.mockResolvedValue({ ok: true });

  // Default DB state
  prisma.campaign.findMany.mockResolvedValue([]);
  prisma.campaignJob.groupBy.mockResolvedValue([]);
  prisma.tenant.findFirst.mockResolvedValue(null);
  prisma.automationSetting.findFirst.mockResolvedValue(null);
  prisma.automationSetting.findUnique.mockResolvedValue(null);
  prisma.automationSetting.update.mockResolvedValue({});
  prisma.automationSetting.create.mockResolvedValue({});
});

// ─── Auth ────────────────────────────────────────────────────────────────────

describe("GET /api/cron/ai-campaign — auth", () => {
  it("returns 401 when CRON_SECRET is set but header is missing", async () => {
    process.env.CRON_SECRET = "secret123";
    const req = mockReq({}); // no x-cron-secret header
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when CRON_SECRET is set and header value is wrong", async () => {
    process.env.CRON_SECRET = "secret123";
    const req = mockReq({ "x-cron-secret": "wrong" });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("accepts request when x-cron-secret matches CRON_SECRET", async () => {
    process.env.CRON_SECRET = "secret123";
    const req = mockReq({ "x-cron-secret": "secret123" });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("accepts request via Authorization Bearer header", async () => {
    process.env.CRON_SECRET = "secret123";
    const req = mockReq({ authorization: "Bearer secret123" });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("returns 401 when CRON_SECRET env var is not set (fail-closed)", async () => {
    delete process.env.CRON_SECRET;
    const req = mockReq({}); // no auth header at all
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

// ─── checkAndNotifyCampaignCompletion: no RUNNING campaigns ──────────────────

describe("checkAndNotifyCampaignCompletion — no RUNNING campaigns", () => {
  it("does not call buildCampaignCompletionEmail when there are no RUNNING campaigns", async () => {
    prisma.campaign.findMany.mockResolvedValue([]);

    await callGet();
    await settle();

    expect(buildCampaignCompletionEmail).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

// ─── checkAndNotifyCampaignCompletion: pending jobs exist ────────────────────

describe("checkAndNotifyCampaignCompletion — RUNNING campaign with pending jobs", () => {
  it("does not mark campaign COMPLETED and does not send email when pending jobs remain", async () => {
    prisma.campaign.findMany.mockResolvedValue([
      { id: "camp-1", tenantId: "t-1", name: "Spring Promo", createdById: "u-1" },
    ]);
    // groupBy returns a row for camp-1 → it has pending jobs → skip it
    prisma.campaignJob.groupBy.mockResolvedValueOnce([
      { campaignId: "camp-1", _count: { id: 5 } },
    ]);

    await callGet();
    await settle();

    expect(prisma.campaign.updateMany).not.toHaveBeenCalled();
    expect(buildCampaignCompletionEmail).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

// ─── checkAndNotifyCampaignCompletion: all jobs done ─────────────────────────

describe("checkAndNotifyCampaignCompletion — RUNNING campaign with zero pending jobs", () => {
  const campaign = { id: "camp-2", tenantId: "t-2", name: "Summer Sale", createdById: "u-2" };
  const creator  = { email: "admin@tenant.com", name: "Alice" };

  function setupCompletedCampaign() {
    prisma.campaign.findMany.mockResolvedValue([campaign]);
    prisma.campaign.updateMany.mockResolvedValue({ count: 1 });

    // First groupBy: pending jobs (QUEUED|ACTIVE) — empty means 0 pending for camp-2
    // Second groupBy: job stats by status for completed campaigns
    prisma.campaignJob.groupBy
      .mockResolvedValueOnce([])  // pending counts — camp-2 not present → 0 pending
      .mockResolvedValueOnce([
        { campaignId: "camp-2", status: "COMPLETED", _count: { id: 8 } },
        { campaignId: "camp-2", status: "FAILED",    _count: { id: 2 } },
      ]);

    prisma.user.findUnique.mockResolvedValue(creator);
  }

  it("calls prisma.campaign.updateMany with status COMPLETED", async () => {
    setupCompletedCampaign();
    await callGet();
    await settle();

    expect(prisma.campaign.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [campaign.id] } },
      data:  { status: "COMPLETED" },
    });
  });

  it("calls buildCampaignCompletionEmail with campaign name and correct stats", async () => {
    setupCompletedCampaign();
    await callGet();
    await settle();

    expect(buildCampaignCompletionEmail).toHaveBeenCalledOnce();
    const [, calledName, stats] = buildCampaignCompletionEmail.mock.calls[0];
    expect(calledName).toBe("Summer Sale");
    expect(stats).toMatchObject({ total: 10, completed: 8, failed: 2, interested: 0 });
  });

  it("calls sendEmail after building the email", async () => {
    setupCompletedCampaign();
    await callGet();
    await settle();

    expect(sendEmail).toHaveBeenCalledOnce();
    const [emailArgs] = sendEmail.mock.calls[0];
    expect(emailArgs.to).toBe(creator.email);
  });
});

// ─── Stats use campaignId filter, not tenant-wide ────────────────────────────

describe("checkAndNotifyCampaignCompletion — stats use campaignId filter", () => {
  it("queries campaignJob.groupBy with the specific campaignId, not a tenant-wide filter", async () => {
    const campaign = { id: "camp-3", tenantId: "t-3", name: "Q1 Push", createdById: "u-3" };
    prisma.campaign.findMany.mockResolvedValue([campaign]);
    prisma.campaign.updateMany.mockResolvedValue({ count: 1 });

    // First groupBy: no pending jobs for camp-3
    // Second groupBy: stats
    prisma.campaignJob.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { campaignId: "camp-3", status: "COMPLETED", _count: { id: 4 } },
        { campaignId: "camp-3", status: "FAILED",    _count: { id: 1 } },
      ]);

    prisma.user.findUnique.mockResolvedValue({ email: "owner@t.com", name: "Bob" });

    await callGet();
    await settle();

    // Both groupBy calls must filter by the specific campaignId(s)
    for (const call of prisma.campaignJob.groupBy.mock.calls) {
      expect(call[0].where).toMatchObject({ campaignId: { in: ["camp-3"] } });
    }
  });
});

// ─── Email recipient: creator vs primary owner fallback ──────────────────────

describe("checkAndNotifyCampaignCompletion — email recipient selection", () => {
  function setupSingleCompletedCampaign(campaign) {
    prisma.campaign.findMany.mockResolvedValue([campaign]);
    prisma.campaign.updateMany.mockResolvedValue({ count: 1 });
    prisma.campaignJob.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { campaignId: campaign.id, status: "COMPLETED", _count: { id: 9 } },
        { campaignId: campaign.id, status: "FAILED",    _count: { id: 1 } },
      ]);
  }

  it("looks up createdById user when campaign has a createdById", async () => {
    const campaign = { id: "c-4", tenantId: "t-4", name: "Promo", createdById: "creator-user" };
    setupSingleCompletedCampaign(campaign);
    prisma.user.findUnique.mockResolvedValue({ email: "creator@t.com", name: "Creator" });

    await callGet();
    await settle();

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where:  { id: "creator-user" },
      select: { email: true, name: true },
    });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("falls back to primary owner when campaign has no createdById", async () => {
    const campaign = { id: "c-5", tenantId: "t-5", name: "Cold Call", createdById: null };
    setupSingleCompletedCampaign(campaign);
    prisma.user.findFirst.mockResolvedValue({ email: "owner@t.com", name: "Owner" });

    await callGet();
    await settle();

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where:  { tenantId: "t-5", isPrimaryOwner: true },
      select: { email: true, name: true },
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("does not call sendEmail when the resolved user has no email", async () => {
    const campaign = { id: "c-6", tenantId: "t-6", name: "No Email", createdById: "u-6" };
    setupSingleCompletedCampaign(campaign);
    prisma.user.findUnique.mockResolvedValue({ email: null, name: "Ghost" });

    await callGet();
    await settle();

    expect(sendEmail).not.toHaveBeenCalled();
  });
});

// ─── Multiple RUNNING campaigns ──────────────────────────────────────────────

describe("checkAndNotifyCampaignCompletion — multiple RUNNING campaigns", () => {
  it("checks each campaign independently and only completes those with no pending jobs", async () => {
    const campaigns = [
      { id: "camp-A", tenantId: "t-A", name: "Camp A", createdById: "u-A" },
      { id: "camp-B", tenantId: "t-B", name: "Camp B", createdById: "u-B" },
    ];
    prisma.campaign.findMany.mockResolvedValue(campaigns);
    prisma.campaign.updateMany.mockResolvedValue({ count: 1 });

    // First groupBy (pending): camp-A has pending jobs, camp-B does not appear → 0 pending
    // Second groupBy (stats): only for camp-B
    prisma.campaignJob.groupBy
      .mockResolvedValueOnce([
        { campaignId: "camp-A", _count: { id: 3 } }, // camp-A still has pending jobs
      ])
      .mockResolvedValueOnce([
        { campaignId: "camp-B", status: "COMPLETED", _count: { id: 5 } },
        { campaignId: "camp-B", status: "FAILED",    _count: { id: 1 } },
      ]);

    prisma.user.findUnique.mockResolvedValue({ email: "b@t.com", name: "B User" });

    await callGet();
    await settle();

    // Only camp-B gets updated (via updateMany with just camp-B's id)
    expect(prisma.campaign.updateMany).toHaveBeenCalledOnce();
    expect(prisma.campaign.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["camp-B"] } },
      data:  { status: "COMPLETED" },
    });

    // Email sent only for camp-B
    expect(sendEmail).toHaveBeenCalledOnce();
  });
});

// ─── Error isolation (.catch(() => {})) ──────────────────────────────────────

describe("checkAndNotifyCampaignCompletion — errors do not crash the cron response", () => {
  it("returns 200 from GET even when campaign.findMany throws inside the fire-and-forget", async () => {
    // Make findMany reject — this runs inside checkAndNotifyCampaignCompletion()
    // which is .catch(() => {})-wrapped, so the main response must still succeed
    prisma.campaign.findMany.mockRejectedValue(new Error("DB connection lost"));

    const { res, body } = await callGet();
    await settle();

    expect(res.status).toBe(200);
    // Main cron payload intact
    expect(body).toMatchObject({ queued: 0, attempted: 0 });
  });

  it("returns 200 and completes normally even when sendEmail throws for one campaign", async () => {
    const campaign = { id: "camp-err", tenantId: "t-err", name: "Error Camp", createdById: "u-err" };
    prisma.campaign.findMany.mockResolvedValue([campaign]);
    prisma.campaign.updateMany.mockResolvedValue({ count: 1 });
    prisma.campaignJob.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { campaignId: "camp-err", status: "COMPLETED", _count: { id: 3 } },
        { campaignId: "camp-err", status: "FAILED",    _count: { id: 1 } },
      ]);
    prisma.user.findUnique.mockResolvedValue({ email: "err@t.com", name: "Err User" });
    sendEmail.mockRejectedValue(new Error("SMTP timeout"));

    const { res, body } = await callGet();
    await settle();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ queued: 0, attempted: 0 });
  });
});

// ─── GET handler: skipped cases ──────────────────────────────────────────────

describe("GET /api/cron/ai-campaign — skipped cases", () => {
  it("returns skipped=true with reason worker_feature_enabled when ENABLE_CAMPAIGN_WORKER is true", async () => {
    isCampaignWorkerEnabled.mockReturnValue(true);
    const { body } = await callGet();
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("worker_feature_enabled");
    expect(runAutomationBatch).not.toHaveBeenCalled();
  });

  it("returns skipped=true with reason execution_mode_worker when resolveAutomationExecutionMode returns WORKER", async () => {
    isCampaignWorkerEnabled.mockReturnValue(false);
    resolveAutomationExecutionMode.mockReturnValue("WORKER");
    const { body } = await callGet();
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("execution_mode_worker");
    expect(runAutomationBatch).not.toHaveBeenCalled();
  });

  it("returns skipped=true with reason interval_not_reached when cron ran too recently", async () => {
    const recentRunAt = new Date(Date.now() - 60_000); // 1 minute ago (< 5 min interval)
    prisma.automationSetting.findFirst.mockResolvedValue({
      key:      "AI_CAMPAIGN_CRON_STATE",
      tenantId: "t-x",
      value:    { lastRunAt: recentRunAt.toISOString() },
    });
    const { body } = await callGet();
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("interval_not_reached");
    expect(runAutomationBatch).not.toHaveBeenCalled();
  });

  it("runs when interval has elapsed", async () => {
    const oldRunAt = new Date(Date.now() - 10 * 60_000); // 10 min ago > 5 min interval
    prisma.automationSetting.findFirst.mockResolvedValue({
      key:      "AI_CAMPAIGN_CRON_STATE",
      tenantId: "t-x",
      value:    { lastRunAt: oldRunAt.toISOString() },
    });
    const { res, body } = await callGet();
    expect(res.status).toBe(200);
    expect(runAutomationBatch).toHaveBeenCalledOnce();
    expect(body.skipped).toBeUndefined();
  });
});

// ─── GET handler: runAutomationBatch failure ──────────────────────────────────

describe("GET /api/cron/ai-campaign — runAutomationBatch failure", () => {
  it("propagates the error status when runAutomationBatch returns ok=false", async () => {
    runAutomationBatch.mockResolvedValue({
      ok:     false,
      status: 500,
      error:  "batch exploded",
    });
    const { res, body } = await callGet();
    expect(res.status).toBe(500);
    expect(body.error).toBe("batch exploded");
  });

  it("does not call checkAndNotifyCampaignCompletion when batch fails", async () => {
    runAutomationBatch.mockResolvedValue({ ok: false, status: 500, error: "fail" });
    await callGet();
    await settle();
    // findMany is the first thing checkAndNotifyCampaignCompletion calls
    expect(prisma.campaign.findMany).not.toHaveBeenCalled();
  });
});
