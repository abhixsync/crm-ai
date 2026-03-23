import { CallStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTenantContext, requireSession, hasRole } from "@/lib/server/auth-guard";
import { getPlanGuard, isPlanLimitError, planLimitResponse } from "@/lib/subscription/plan-guard";
import { runAIWithFailover } from "@/lib/ai/provider-router";
import { initiateTelephonyCallWithFailover } from "@/lib/telephony/provider-router";
import { logTelephony, redactedPhone } from "@/lib/telephony/logger";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

const DEMO_PROMPTS = {
  new_lead:
    "You are calling a new lead to introduce our loan services. Be friendly, professional, and briefly explain the benefits. Ask if they are interested in learning more.",
  follow_up:
    "You are following up with a lead who previously showed interest. Reference their earlier enquiry, ask if they have any questions, and try to schedule a callback with a human advisor.",
  conversion:
    "You are calling a warm lead to close the deal. Highlight competitive rates, fast approval, and minimal paperwork. Guide them toward the next step in the application process.",
};

export async function POST(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Only admins can trigger demo calls" }, { status: 403 });
  }

  const { phone, scriptType } = await request.json();

  if (!phone || typeof phone !== "string" || phone.trim().length < 5) {
    return Response.json({ error: "A valid phone number is required" }, { status: 400 });
  }

  const tenant = getTenantContext(auth.session);
  const tenantId = tenant.tenantId;

  if (!tenantId) {
    return Response.json({ error: "Demo calls require a tenant context. Log in as a tenant admin to use this feature." }, { status: 400 });
  }

  // Plan guard — demo calls still count against quota
  try {
    const guard = await getPlanGuard(tenantId);
    guard.assertHasFeature("hasAiCalling");
    guard.assertCanMakeAiCall();
  } catch (err) {
    if (isPlanLimitError(err)) return planLimitResponse(err);
    throw err;
  }

  let callLog;

  try {
    // Upsert a placeholder demo customer for this tenant so callLog has a valid customerId
    const demoCustomer = await prisma.customer.upsert({
      where: { tenantId_phone: { tenantId, phone: "DEMO_PLACEHOLDER" } },
      update: {},
      create: {
        tenantId,
        firstName: "Demo",
        lastName: "Contact",
        phone: "DEMO_PLACEHOLDER",
      },
    });

    callLog = await prisma.callLog.create({
      data: {
        tenantId,
        customerId: demoCustomer.id,
        status: CallStatus.INITIATED,
        mode: "AI",
        attemptNumber: 1,
        startedAt: new Date(),
        summary: `Demo call — ${scriptType || "new_lead"} script`,
        metadata: { demo: true, scriptType: scriptType || "new_lead", phone: redactedPhone(phone) },
      },
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();
    throw error;
  }

  try {
    const demoPrompt = DEMO_PROMPTS[scriptType] || DEMO_PROMPTS.new_lead;

    // Generate the AI script
    const aiOutput = await runAIWithFailover({
      task: "CALL_SCRIPT",
      payload: {
        customer: { name: "Demo Contact", phone, loanType: "Personal Loan", loanAmount: 500000 },
        systemPromptOverride: demoPrompt,
      },
    });
    const script = aiOutput.result.script;

    const baseUrl = process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";

    const telephonyOutput = await initiateTelephonyCallWithFailover({
      to: phone.trim(),
      script,
      fromNumber: process.env.TWILIO_CALLER_ID || process.env.TWILIO_FROM_NUMBER || undefined,
      preferredProviderType: "TWILIO",
    });

    const call = telephonyOutput.result;

    await prisma.callLog.updateMany({
      where: { id: callLog.id, tenantId },
      data: {
        providerCallId: call.providerCallId,
        aiProviderUsed: aiOutput.provider.name,
        telephonyProviderUsed: telephonyOutput.provider.name,
        telephonyProviderType: telephonyOutput.provider.type,
        status: CallStatus[call.status] || CallStatus.INITIATED,
      },
    });

    logTelephony("info", "api.calls.demo.completed", {
      callLogId: callLog.id,
      to: redactedPhone(phone),
      aiProvider: aiOutput.provider?.name,
      telephonyProvider: telephonyOutput.provider?.name,
    });

    return Response.json({
      callId: callLog.id,
      status: call.status,
      provider: telephonyOutput.provider.name,
      message: "Demo call initiated successfully",
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return databaseUnavailableResponse();

    if (callLog?.id) {
      await prisma.callLog.updateMany({
        where: { id: callLog.id, tenantId },
        data: {
          status: CallStatus.FAILED,
          errorReason: error?.message || "Demo call failed",
          endedAt: new Date(),
        },
      });
    }

    logTelephony("error", "api.calls.demo.failed", {
      callLogId: callLog?.id,
      to: redactedPhone(phone),
      message: error?.message,
    });

    return Response.json({ error: error?.message || "Failed to initiate demo call" }, { status: 400 });
  }
}
