import type { Request, Response } from 'express';
import { generateMessage, generateTestMessage } from '../services/gemini.service.js';

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
  const { message } = request.body as { message?: unknown };

  if (typeof message !== 'string' || !message.trim()) {
    response.status(400).json({ error: 'Message is required' });
    return;
  }

  try {
    const aiMessage = await generateMessage(message);

    response.status(200).json({ message: aiMessage });
  } catch (error) {
    console.error('Gemini chat request failed:', error);
    response.status(502).json({ error: 'Unable to generate an AI response' });
  }
}
