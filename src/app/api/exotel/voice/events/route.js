import { prisma } from "@/lib/prisma";
import { mapTelephonyStatus } from "@/lib/telephony/provider-router";

export async function POST(request) {
  try {
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

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[exotel/events] Error:", error);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
