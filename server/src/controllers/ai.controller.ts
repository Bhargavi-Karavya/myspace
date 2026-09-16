import type { Request, Response } from 'express';
import { generateMessage, generateTestMessage } from '../services/gemini.service.js';
import { chatRequestSchema } from '../validators/ai.validator.js';

export async function getAiTest(_request: Request, response: Response) {
  try {
    const message = await generateTestMessage();

    response.status(200).json({ message });
  } catch (error) {
    console.error('Gemini test request failed:', error);
    response.status(502).json({ error: 'Unable to generate an AI response' });
  }
}

export async function chatWithAi(request: Request, response: Response) {
  const parsed = chatRequestSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      error: 'Invalid request',
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'messages',
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const aiMessage = await generateMessage(parsed.data.messages);

    response.status(200).json({ message: aiMessage });
  } catch (error) {
    console.error('Gemini chat request failed:', error);
    response.status(500).json({ error: 'Unable to generate a response right now' });
  }
}
