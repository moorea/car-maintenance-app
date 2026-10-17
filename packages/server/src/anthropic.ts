import Anthropic from '@anthropic-ai/sdk'
import { AssistantError, type LanguageModel, type ModelStopReason } from '@car/core'

export interface AnthropicModelOptions {
  /** Such as "claude-opus-5-5". */
  model: string
  /** Answers are a few sentences; this only stops a runaway. */
  maxTokens?: number
}

/** Streaming text reaches the phone as it arrives, so a fast first word matters more than depth. */
const EFFORT = 'low'

/**
 * Claude through the Anthropic API, answering from the request's documents with citations. Each
 * stored fact is a plain-text document, so Claude can only cite what the app stored, and the
 * citation says which fact it was. The documents sit at the front of the conversation, so prompt
 * caching makes follow-up questions about the same car cheaper.
 */
export const anthropicModel = (
  client: Anthropic,
  options: AnthropicModelOptions,
): LanguageModel => ({
  stream: async (request, onEvent, signal) => {
    const [first, ...rest] = request.turns
    if (first?.role !== 'user') throw new Error('The conversation must start with a question')
    const last = request.documents.length - 1
    const documents = request.documents.map((doc, i): Anthropic.Beta.BetaRequestDocumentBlock => ({
      type: 'document',
      source: { type: 'text', media_type: 'text/plain', data: doc.text },
      title: doc.title,
      citations: { enabled: true },
      ...(i === last && { cache_control: { type: 'ephemeral' } }),
    }))

    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort)
    if (signal?.aborted) abort()
    try {
      const stream = client.beta.messages.stream(
        {
          model: options.model,
          max_tokens: options.maxTokens ?? 8_000,
          system: request.system,
          messages: [
            { role: 'user', content: [...documents, { type: 'text', text: first.text }] },
            ...rest.map((turn) => ({ role: turn.role, content: turn.text })),
          ],
          output_config: { effort: EFFORT },
          // On a safety decline the API retries on Anthropic's recommended fallback model.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        },
        { signal: controller.signal },
      )
      for await (const event of stream) {
        if (event.type !== 'content_block_delta') continue
        if (event.delta.type === 'text_delta') {
          onEvent({ type: 'text', text: event.delta.text })
        } else if (
          event.delta.type === 'citations_delta' &&
          'document_index' in event.delta.citation
        ) {
          onEvent({ type: 'citation', documentIndex: event.delta.citation.document_index })
        }
      }
      const message = await stream.finalMessage()
      return stopReason(message.stop_reason)
    } catch (error) {
      throw translate(error)
    } finally {
      signal?.removeEventListener('abort', abort)
    }
  },
})

const stopReason = (reason: string | null): ModelStopReason =>
  reason === 'refusal' ? 'declined' : reason === 'max_tokens' ? 'max-tokens' : 'end'

/** Failures the owner can do nothing about read as "not available right now". */
const translate = (error: unknown): unknown => {
  if (
    error instanceof Anthropic.RateLimitError ||
    error instanceof Anthropic.InternalServerError ||
    error instanceof Anthropic.APIConnectionError ||
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new AssistantError('unavailable', error.message)
  }
  return error
}
