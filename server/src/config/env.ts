import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.url(),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).default('gemini-3.6-flash'),
});

export const env = envSchema.parse(process.env);
