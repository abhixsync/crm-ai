import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().optional(),
  APP_BASE_URL: z.string().url().optional(),

  OPENAI_API_KEY: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  TWILIO_CALLER_ID: z.string().optional(),
  TWILIO_API_KEY_SID: z.string().optional(),
  TWILIO_API_KEY_SECRET: z.string().optional(),
  TWILIO_TWIML_APP_SID: z.string().optional(),
  VONAGE_APPLICATION_ID: z.string().optional(),
  VONAGE_PRIVATE_KEY: z.string().optional(),
  VONAGE_FROM_NUMBER: z.string().optional(),
  PLIVO_AUTH_ID: z.string().optional(),
  PLIVO_AUTH_TOKEN: z.string().optional(),
  PLIVO_FROM_NUMBER: z.string().optional(),
  DEFAULT_COUNTRY_CODE: z.string().optional(),

  DIALOGFLOW_PROJECT_ID: z.string().optional(),
  DIALOGFLOW_SERVICE_ACCOUNT_JSON: z.string().optional(),
  DIALOGFLOW_SERVICE_ACCOUNT_BASE64: z.string().optional(),
  DIALOGFLOW_LANGUAGE_CODE: z.string().optional(),

  DEEPGRAM_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);