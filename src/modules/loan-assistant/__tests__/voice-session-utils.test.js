import { describe, expect, it } from "vitest";
import {
  getEffectiveAiToListenDelayMs,
  getRecognitionRestartDelayMs,
  getVoiceRetryNotice,
  isMeaningfulVoiceTranscript,
} from "@/modules/loan-assistant/voice-session-utils.js";

describe("voice session utils", () => {
  it("accepts concise but meaningful loan-related transcripts", () => {
    expect(isMeaningfulVoiceTranscript("business loan")).toBe(true);
    expect(isMeaningfulVoiceTranscript("please do")).toBe(true);
    expect(isMeaningfulVoiceTranscript("1 crore")).toBe(true);
    expect(isMeaningfulVoiceTranscript("you already asked me this question before")).toBe(true);
  });

  it("filters low-signal garbage transcripts", () => {
    expect(isMeaningfulVoiceTranscript("you are shit")).toBe(false);
    expect(isMeaningfulVoiceTranscript("first get yourself for brain")).toBe(false);
    expect(isMeaningfulVoiceTranscript("yah ladki")).toBe(false);
  });

  it("backs off recognition restart delays after repeated silence", () => {
    expect(getRecognitionRestartDelayMs(1)).toBe(1000);
    expect(getRecognitionRestartDelayMs(2)).toBe(1600);
    expect(getRecognitionRestartDelayMs(3)).toBe(2400);
    expect(getRecognitionRestartDelayMs(6)).toBe(3200);
  });

  it("enforces a minimum ai-to-listen delay for browser playback", () => {
    expect(getEffectiveAiToListenDelayMs(200, "browser")).toBe(1000);
    expect(getEffectiveAiToListenDelayMs(undefined, "browser")).toBe(1200);
    expect(getEffectiveAiToListenDelayMs(300, "elevenlabs")).toBe(700);
  });

  it("provides progressively clearer retry notices", () => {
    expect(getVoiceRetryNotice(1)).toBe("");
    expect(getVoiceRetryNotice(2).toLowerCase()).toContain("did not catch");
    expect(getVoiceRetryNotice(4).toLowerCase()).toContain("still listening");
  });
});