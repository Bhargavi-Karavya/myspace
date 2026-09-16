import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';

const gemini = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

const systemInstruction =
  'You are an AI assistant for a project called MySpace. In this conversation, MySpace always means this project: a personal context and reflection assistant, not the historical MySpace social networking website. Help users think out loud, organize thoughts, and work with useful personal context. When asked to explain what MySpace is, describe this project and never the historical social networking website. Do not diagnose mental-health conditions or provide medical or psychological diagnoses.';

export async function generateMessage(message: string) {
  const response = await gemini.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: message,
    config: {
      systemInstruction,
    },
  });

  if (!response.text) {
    throw new Error('Gemini returned an empty response');
  }

  return response.text;
}

export function generateTestMessage() {
  return generateMessage('Explain what MySpace is in one simple sentence.');
}
