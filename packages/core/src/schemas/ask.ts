import { z } from 'zod'

/** Longer questions are refused; nobody types more than this on a phone. */
export const MAX_QUESTION_LENGTH = 1_000

/** A question sent to the assistant endpoint. The server checks it before spending anything. */
export const askRequestSchema = z.object({
  vehicleId: z.uuid(),
  conversationId: z.uuid().optional(),
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
})

export type AskRequestBody = z.infer<typeof askRequestSchema>
