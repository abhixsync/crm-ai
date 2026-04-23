import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { mapTelephonyStatus } from "@/lib/telephony/provider-router";
import { finalizeCall } from "@/lib/calls/call-finalizer";
import { publishEvent } from "@/lib/events/event-publisher";
import { verifyWebhookSig } from "@/lib/telephony/webhook-auth";

export async function POST(request) {
  try {
    const url = new URL(request.url);
    const callLogId = url.searchParams.get("callLogId");

    // Verify HMAC sig if callLogId is in query params
    if (callLogId && !verifyWebhookSig(url.searchParams, callLogId)) {
      return new Response("Forbidden", { status: 403 });
    }

    const formData = await request.formData();
    const callSid = String(formData.get("CallSid") || formData.get("Sid") || "").trim();
    const status = String(formData.get("Status") || formData.get("CallStatus") || "").trim();
    const duration = parseInt(formData.get("Duration") || formData.get("RecordingDuration") || "0", 10);
    const recordingUrl = String(formData.get("RecordingUrl") || "").trim() || null;

    if (!callSid) {
      return Response.json({ error: "Missing CallSid" }, { status: 400 });
    }

    const normalizedStatus = mapTelephonyStatus("EXOTEL", status);

    const callLog = await prisma.callLog.findFirst({
      where: { providerCallId: callSid },
      select: { id: true, tenantId: true, customerId: true, status: true },
    });

    if (!callLog) {
      console.warn("[exotel/events] No CallLog found for sid:", callSid);
      return Response.json({ ok: true, message: "No matching call log" });
    }

    const updateData = {};
    if (normalizedStatus === "COMPLETED" || normalizedStatus === "FAILED" || normalizedStatus === "NO_ANSWER") {
      updateData.status = normalizedStatus;
      updateData.endedAt = new Date();
    }
    if (duration > 0) updateData.durationSecs = duration;
    if (recordingUrl) updateData.recordingUrl = recordingUrl;

    if (Object.keys(updateData).length > 0) {
      await prisma.callLog.updateMany({
        where: { id: callLog.id, tenantId: callLog.tenantId },
        data: updateData,
      });
    }

    const isTerminal = normalizedStatus === "COMPLETED" || normalizedStatus === "FAILED" || normalizedStatus === "NO_ANSWER";

    if (isTerminal) {
      // Publish event for real-time UI updates
      if (callLog.tenantId) {
        publishEvent(callLog.tenantId, {
          type: "call:status",
          payload: { callLogId: callLog.id, status: normalizedStatus },
        }).catch(() => {});
      }

      // Trigger finalize on COMPLETED (non-blocking)
      if (normalizedStatus === "COMPLETED") {
        after(() =>
          finalizeCall(callLog.id, callLog.customerId, callLog.tenantId, null, {}, 0)
        );
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[exotel/events] Error:", error);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
