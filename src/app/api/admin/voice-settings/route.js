import { requireSession, hasRole, getTenantContext } from "@/lib/server/auth-guard";
import { getTenantVoiceId, setTenantVoiceId, ELEVENLABS_FEMALE_VOICES } from "@/lib/speech/elevenlabs-voices";

export async function GET(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { tenantId } = getTenantContext(auth.session, request);
  if (!tenantId) return Response.json({ error: "Tenant context required" }, { status: 400 });

  const voiceId = await getTenantVoiceId(tenantId);
  return Response.json({ voiceId, voices: ELEVENLABS_FEMALE_VOICES });
}

export async function PUT(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { tenantId } = getTenantContext(auth.session, request);
  if (!tenantId) return Response.json({ error: "Tenant context required" }, { status: 400 });

  const { voiceId } = await request.json();
  if (!voiceId) return Response.json({ error: "voiceId is required" }, { status: 400 });

  try {
    await setTenantVoiceId(tenantId, voiceId);
    return Response.json({ success: true, voiceId });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
