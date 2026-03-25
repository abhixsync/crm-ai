/**
 * Voice Utilities for Loan Assistant
 * Handles speech-to-text (Deepgram) and text-to-speech (ElevenLabs)
 * Enables voice agent functionality for phone calls
 */

/**
 * Convert speech to text using Deepgram
 * @param {Blob|Buffer} audioData - Audio file data
 * @returns {Promise<string>} - Transcribed text
 */
export async function speechToText(audioData) {
  if (!process.env.DEEPGRAM_API_KEY) {
    console.warn('Deepgram API key not configured');
    return '';
  }

  try {
    const response = await fetch('https://api.deepgram.com/v1/listen', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/octet-stream',
      },
      body: audioData,
    });

    const result = await response.json();
    const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    
    console.log('🎤 Speech-to-text:', transcript);
    return transcript;
  } catch (error) {
    console.error('Deepgram STT error:', error.message);
    return '';
  }
}

/**
 * Convert text to speech using ElevenLabs
 * @param {string} text - Text to convert
 * @param {string} voiceId - Voice ID (default: "21m00Tcm4TlvDq8ikWAM" - Rachel)
 * @returns {Promise<Buffer>} - Audio data
 */
export async function textToSpeech(text, voiceId = '21m00Tcm4TlvDq8ikWAM') {
  if (!process.env.ELEVENLABS_API_KEY) {
    console.warn('ElevenLabs API key not configured');
    return null;
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs error: ${response.statusText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    console.log('🔊 Text-to-speech generated:', text.substring(0, 50) + '...');
    return Buffer.from(audioBuffer);
  } catch (error) {
    console.error('ElevenLabs TTS error:', error.message);
    return null;
  }
}

/**
 * Voice IDs for different speakers (ElevenLabs)
 */
export const VOICE_IDS = {
  // Female voices
  RACHEL: '21m00Tcm4TlvDq8ikWAM', // Neutral, clear
  DOMI: 'AZnzlk1XvdvUBZXUNXIN',   // Warm, engaging
  BELLA: 'EXAVITQu4vr4xnSDxMaL',  // Young, energetic
  ELLI: 'MF3mGyEYCl7XYWbV9V6H',   // Sweet, friendly
  
  // Male voices
  ADAM: 'pNInz6obpgDQGcFmaJgB',   // authoritative, deep
  ARNOLD: 'VR6AewLVsFNHj38rNoZc',  // Thick accent
  BILL: 'nPczCjzI2devNBz1zQrb',    // Dry, formal
  CALLUM: 'N2lVS1Aw4OWFqLcMlvym',  // Serious
};

/**
 * Hinglish voice for loan assistant (mix of Hindi + English)
 * Default: Rachel (female) with professional tone
 */
export const DEFAULT_VOICE_ID = VOICE_IDS.RACHEL;

/**
 * Stream speech for real-time voice interaction
 * Useful for Twilio integration
 */
export async function generateSpeechStream(text, voiceId = DEFAULT_VOICE_ID) {
  try {
    const audioBuffer = await textToSpeech(text, voiceId);
    if (!audioBuffer) {
      console.error('Failed to generate audio');
      return null;
    }

    // Convert to base64 for transmission
    return audioBuffer.toString('base64');
  } catch (error) {
    console.error('Speech stream generation error:', error.message);
    return null;
  }
}

/**
 * Handle Twilio voice webhook response
 * Generates TwiML response with AI message as speech
 */
export async function generateTwiMLResponse(aiMessage) {
  // Escape special characters for TwiML
  const safeMessage = aiMessage
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  // Use ElevenLabs for higher quality voice (if API key available)
  if (process.env.ELEVENLABS_API_KEY) {
    try {
      const audioBase64 = await generateSpeechStream(aiMessage);
      if (audioBase64) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${process.env.ELEVENLABS_AUDIO_URL || 'data:audio/mp3;base64,' + audioBase64}</Play>
</Response>`;
      }
    } catch (error) {
      console.error('ElevenLabs TwiML generation failed:', error.message);
    }
  }

  // Fallback to Google Hindi Wavenet voice (built into Twilio)
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN" voice="Google.hi-IN-Wavenet-A">${safeMessage}</Say>
</Response>`;
}

/**
 * Extract audio from form data
 * Used in voice call handlers
 */
export async function extractAudioFromRequest(request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('CallRecording');
    
    if (!audioFile) {
      console.log('No audio file in request');
      return null;
    }

    const audioBuffer = await audioFile.arrayBuffer();
    return Buffer.from(audioBuffer);
  } catch (error) {
    console.error('Error extracting audio:', error.message);
    return null;
  }
}

/**
 * Parse customer speech input from Twilio webhook
 */
export async function parseVoiceInput(request) {
  try {
    const formData = await request.formData();
    const speechResult = formData.get('SpeechResult');
    const confidence = parseFloat(formData.get('Confidence') || '0');
    
    return {
      text: speechResult || '',
      confidence,
      success: !!speechResult && confidence > 0.5,
    };
  } catch (error) {
    console.error('Error parsing voice input:', error.message);
    return {
      text: '',
      confidence: 0,
      success: false,
    };
  }
}
