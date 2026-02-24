export const TELEPHONY_OPERATIONS = {
  INITIATE_CALL: "INITIATE_CALL",
  SPEECH_TO_TEXT: "SPEECH_TO_TEXT",
  TEXT_TO_SPEECH: "TEXT_TO_SPEECH",
  CHECK_CONNECTION: "CHECK_CONNECTION",
};

function normalizeCallResult(rawResult) {
  return {
    providerCallId: String(rawResult?.providerCallId || rawResult?.sid || rawResult?.callId || "").trim(),
    status: String(rawResult?.status || "INITIATED").trim().toUpperCase(),
    providerLabel: String(rawResult?.providerLabel || "").trim(),
    metadata: rawResult?.metadata || null,
  };
}

export function createTelephonyAdapter({
  id,
  initiateCall,
  speechToText,
  textToSpeech,
  mapStatus,
  checkConnection,
}) {
  return {
    id,
    async run({ operation, payload, config }) {
      if (operation === TELEPHONY_OPERATIONS.INITIATE_CALL) {
        const rawResult = await initiateCall({ payload, config });
        return normalizeCallResult(rawResult);
      }

      if (operation === TELEPHONY_OPERATIONS.SPEECH_TO_TEXT) {
        return speechToText({ payload, config });
      }

      if (operation === TELEPHONY_OPERATIONS.TEXT_TO_SPEECH) {
        return textToSpeech({ payload, config });
      }

      if (operation === TELEPHONY_OPERATIONS.CHECK_CONNECTION) {
        return checkConnection({ payload, config });
      }

      throw new Error(`Unsupported telephony operation: ${operation}`);
    },
    mapStatus(providerStatus) {
      return mapStatus(providerStatus);
    },
  };
}
