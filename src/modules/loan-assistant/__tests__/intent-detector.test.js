import { describe, expect, it } from "vitest";
import {
  detectCallbackPreference,
  detectIntent,
  extractLoanDetails,
} from "@/modules/loan-assistant/intent-detector.js";

describe("loan assistant intent detector", () => {
  it("classifies late timing phrases as callback later", () => {
    const result = detectIntent("it's quite late for a call");

    expect(result.intent).toBe("call_back_later");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("extracts specific callback time from english phrases", () => {
    const preference = detectCallbackPreference("Call me after 10 please");

    expect(preference?.callbackTime).toBe("after 10");
  });

  it("extracts specific callback time from hindi/hinglish phrases", () => {
    const preference = detectCallbackPreference("10 baje ke baad call karna");

    expect(preference?.callbackTime).toBe("after 10");
  });

  it("classifies hindi morning callback phrases as callback later", () => {
    const result = detectIntent("अभी नहीं, कल सुबह कॉल करना");

    expect(result.intent).toBe("call_back_later");
    expect(result.details.callbackTime).toBe("tomorrow morning");
  });

  it("classifies hindi evening callback phrases as callback later", () => {
    const result = detectIntent("कल शाम बात करना");

    expect(result.intent).toBe("call_back_later");
    expect(result.details.callbackTime).toBe("tomorrow evening");
  });

  it("classifies hindi explanation prompts as interested", () => {
    const result = detectIntent("aap kuch smjhane wale thi");

    expect(result.intent).toBe("interested");
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("classifies 'by tomorrow' as interested timeline signal", () => {
    const result = detectIntent("I need the loan by tomorrow");

    expect(result.intent).toBe("interested");
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("extracts immediate timeline for tomorrow phrases", () => {
    const details = extractLoanDetails("Need disbursement by tomorrow");

    expect(details.timeline).toBe("immediate");
  });
});
