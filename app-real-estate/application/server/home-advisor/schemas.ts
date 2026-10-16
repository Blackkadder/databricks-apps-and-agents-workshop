import { z } from 'zod';

export const homeAdvisorChatSchema = z
  .object({
    sessionId: z.string().uuid().optional(),
    message: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const homeAdvisorSessionSchema = z
  .object({
    sessionId: z.string().uuid(),
  })
  .strict();
