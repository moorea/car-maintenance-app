// The assistant edge function's entry point. `pnpm --filter @car/server build` bundles it into
// supabase/functions/assistant/index.js for Supabase's Deno runtime.
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { anthropicModel } from './anthropic'
import { createAssistantHandler } from './handler'
import { anthropicOdometerReader, createOdometerHandler } from './odometer'
import { anthropicQuoteReader, createQuoteHandler } from './quotes'
import { supabaseStore } from './supabase'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): unknown
}

const env = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is not set`)
  return value
}

// Supabase provides these to every function.
const url = env('SUPABASE_URL')
const anonKey = env('SUPABASE_ANON_KEY')
const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Set with `supabase secrets set`. Without a key the endpoint answers 503, so the app can say
// the assistant is not available yet.
const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
const anthropic = apiKey ? new Anthropic({ apiKey }) : undefined
const modelName = Deno.env.get('ASSISTANT_MODEL') ?? 'claude-opus-5-5'
const dailyLimit = Number(Deno.env.get('ASSISTANT_DAILY_LIMIT') ?? 50)

const userFor = async (token: string) => {
  const { data, error } = await admin.auth.getUser(token)
  return error ? undefined : data.user.id
}
const storeFor = (token: string, userId: string) =>
  supabaseStore(
    createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    admin,
    userId,
  )
const log = (message: string, error?: unknown) => console.error(message, error)

const answer = createAssistantHandler({
  userFor,
  storeFor,
  model: anthropic && anthropicModel(anthropic, { model: modelName }),
  dailyLimit,
  today: () => new Date().toISOString().slice(0, 10),
  log,
})

// Reading a shop quote's photo shares the function, its key and its daily limit with Ask.
const readQuote = createQuoteHandler({
  userFor,
  storeFor,
  reader: anthropic && anthropicQuoteReader(anthropic, { model: modelName }),
  dailyLimit,
  log,
})

// So does reading the odometer from a photo of the dashboard.
const readOdometer = createOdometerHandler({
  userFor,
  storeFor,
  reader: anthropic && anthropicOdometerReader(anthropic, { model: modelName }),
  dailyLimit,
  log,
})

Deno.serve((request) => {
  const path = new URL(request.url).pathname
  if (path.endsWith('/read-quote')) return readQuote(request)
  if (path.endsWith('/read-odometer')) return readOdometer(request)
  return answer(request)
})
