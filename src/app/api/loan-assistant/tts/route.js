import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth.js";

const DEFAULT_ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";

function parseNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseBoolean(value, fallback = true) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return fallback;
}

function resolveVoiceId(languageCode, requestedVoiceId) {
  if (requestedVoiceId && typeof requestedVoiceId === "string") {
    const trimmed = requestedVoiceId.trim();
    if (trimmed) {
      return { voiceId: trimmed, label: "request" };
    }
  }

  const normalized = String(languageCode || "").toLowerCase();
  const voiceIdHi = String(process.env.ELEVENLABS_VOICE_ID_HI || "").trim();
  const voiceIdEn = String(process.env.ELEVENLABS_VOICE_ID_EN || "").trim();
  const voiceIdDefault = String(process.env.ELEVENLABS_VOICE_ID_DEFAULT || process.env.ELEVENLABS_VOICE_ID || "").trim();

  if (normalized.startsWith("hi") && voiceIdHi) {
    return { voiceId: voiceIdHi, label: "hindi" };
  }

  if ((normalized.startsWith("en") || normalized === "hinglish") && voiceIdEn) {
    return { voiceId: voiceIdEn, label: "english" };
  }

  if (voiceIdDefault) {
    return { voiceId: voiceIdDefault, label: "default" };
  }

  return { voiceId: DEFAULT_ELEVENLABS_VOICE_ID, label: "built-in-default" };
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const isElevenLabsDisabled = parseBoolean(
      process.env.DISABLE_ELEVENLABS_TTS ?? process.env.NEXT_PUBLIC_DISABLE_ELEVENLABS_TTS,
      false
    );

    if (isElevenLabsDisabled) {
      return NextResponse.json(
        {
          success: false,
          error: "ElevenLabs TTS is disabled by DISABLE_ELEVENLABS_TTS.",
        },
        { status: 503 }
      );
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: "ELEVENLABS_API_KEY is not configured.",
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const text = String(body?.text || "").trim();

    if (!text) {
      return NextResponse.json(
        {
          success: false,
          error: "text is required",
        },
        { status: 400 }
      );
    }

    if (text.length > 1500) {
      return NextResponse.json(
        {
          success: false,
          error: "text exceeds max length (1500)",
        },
        { status: 400 }
      );
    }

    const languageCode = String(body?.language_code || "").trim();
    const { voiceId, label } = resolveVoiceId(languageCode, body?.voice_id);

    const modelId = String(process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID).trim();
    const stability = parseNumber(process.env.ELEVENLABS_STABILITY, 0.45);
    const similarityBoost = parseNumber(process.env.ELEVENLABS_SIMILARITY_BOOST, 0.8);
    const style = parseNumber(process.env.ELEVENLABS_STYLE, 0.25);
    const useSpeakerBoost = parseBoolean(process.env.ELEVENLABS_SPEAKER_BOOST, true);

    const upstreamResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability,
          similarity_boost: similarityBoost,
          style,
          use_speaker_boost: useSpeakerBoost,
        },
      }),
    });

    if (!upstreamResponse.ok) {
      const upstreamStatus = upstreamResponse.status;
      const errorText = await upstreamResponse.text().catch(() => "");

      let errorMessage = `ElevenLabs request failed (${upstreamStatus})`;
      let responseStatus = 502;

      if (upstreamStatus === 401) {
        errorMessage = "ElevenLabs authentication failed (401). Verify ELEVENLABS_API_KEY and key type/scopes.";
        responseStatus = 401;
      } else if (upstreamStatus === 403) {
        errorMessage = "ElevenLabs access denied (403). Check account permissions and model/voice access.";
        responseStatus = 403;
      } else if (upstreamStatus === 429) {
        errorMessage = "ElevenLabs rate limit reached (429). Retry shortly or reduce request rate.";
        responseStatus = 429;
      }

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
          upstream_status: upstreamStatus,
          details: errorText.slice(0, 500),
        },
        { status: responseStatus }
      );
    }

    const arrayBuffer = await upstreamResponse.arrayBuffer();

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "x-voice-id": voiceId,
        "x-voice-label": label,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to synthesize speech",
      },
      { status: 500 }
    );
  }
}
