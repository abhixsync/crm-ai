import { getAudio } from "@/lib/speech/audio-cache";

export async function GET(_request, { params }) {
  const { id } = await params;
  if (!id) return new Response("Not found", { status: 404 });

  const clip = await getAudio(id);
  if (!clip) return new Response("Not found", { status: 404 });

  return new Response(clip.buffer, {
    headers: {
      "Content-Type": clip.mimeType || "audio/mpeg",
      "Cache-Control": "no-store",
      "Content-Length": String(clip.buffer.length),
    },
  });
}
