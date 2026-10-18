import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PowerSyncDatabase } from '@powersync/node'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  attachmentDownloadUrl,
  createAttachmentRepo,
  createPowerSyncRepositories,
  createSyncSession,
  powerSyncSessionDatabase,
  schema,
  supabaseAccount,
  SupabaseConnector,
} from '../src'
import { nodeDeviceFiles } from '../src/testing/nodeDeviceFiles'

/**
 * The local stack the end-to-end tests run against: `supabase start` and the PowerSync service
 * from scripts/start-local-sync.sh. The defaults are what the Supabase CLI prints for any local
 * project; they are not secrets.
 */
export const stack = {
  supabaseUrl: process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321',
  anonKey:
    process.env.SUPABASE_ANON_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  serviceRoleKey:
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  powerSyncUrl: process.env.POWERSYNC_URL ?? 'http://127.0.0.1:8080',
}

const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }

/** A Supabase client that bypasses RLS, to look at what the server holds. */
export const admin: SupabaseClient = createClient(stack.supabaseUrl, stack.serviceRoleKey, {
  auth: noSession,
})

export interface TestUser {
  id: string
  email: string
  password: string
}

/** A new confirmed user with a password, so tests sign in without email codes. */
export const createUser = async (): Promise<TestUser> => {
  const email = `e2e-${crypto.randomUUID()}@example.com`
  const password = crypto.randomUUID()
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw error
  return { id: data.user.id, email, password }
}

/**
 * One phone running the app's real data layer, wired as apps/mobile/src/bootstrap/live.ts wires
 * it: PowerSync's SQLite database, the Supabase connector, the sync session, attachments and
 * account deletion. Only the platform pieces differ: Node SQLite and a temporary folder for files.
 */
export const openPhone = async (user: TestUser) => {
  const dir = mkdtempSync(join(tmpdir(), 'car-e2e-'))
  const supabase = createClient(stack.supabaseUrl, stack.anonKey, { auth: noSession })
  const signIn = await supabase.auth.signInWithPassword(user)
  if (signIn.error) throw signIn.error

  // PowerSync shares locks between databases with the same file name, even in other folders.
  const db = new PowerSyncDatabase({
    schema,
    database: { dbFilename: `${crypto.randomUUID()}.db`, dbLocation: dir },
  })
  await db.init()
  const files = nodeDeviceFiles(join(dir, 'files'))
  const storage = { url: stack.supabaseUrl, anonKey: stack.anonKey }
  const accessToken = async () => (await supabase.auth.getSession()).data.session?.access_token
  const dropped: string[] = []
  const connector = SupabaseConnector.forClient(supabase, {
    powerSyncUrl: stack.powerSyncUrl,
    storage,
    readFile: (id) => files.read(id),
    onDropped: (message) => dropped.push(message),
  })
  const attachments = createAttachmentRepo({
    db,
    files,
    downloadUrl: attachmentDownloadUrl({ ...storage, accessToken }),
  })
  const session = createSyncSession(
    powerSyncSessionDatabase(db, connector, () => attachments.cleanUp()),
    () => {},
  )
  const account = supabaseAccount({
    deleteOnServer: () => supabase.rpc('delete_account'),
    auth: { signOut: async () => void (await supabase.auth.signOut({ scope: 'local' })) },
    eraseLocal: () => session.discard(),
  })
  await session.setUser(user.id)

  return {
    user,
    db,
    supabase,
    files,
    attachments,
    account,
    session,
    /** Messages for local changes the server refused and the uploader dropped. */
    dropped,
    ...createPowerSyncRepositories(db),
    /** Signs this phone in as `next`, as the sign-in screen would. */
    signInAs: async (next: TestUser) => {
      const { error } = await supabase.auth.signInWithPassword(next)
      if (error) throw error
      await session.setUser(next.id)
    },
    /** Signs out, as the account screen would. */
    signOut: async () => {
      await supabase.auth.signOut({ scope: 'local' })
      await session.setUser(null)
    },
    /** Loses its connection: changes stay queued on the phone until `goOnline`. */
    goOffline: () => db.disconnect(),
    goOnline: () => db.connect(connector),
    /** Waits until everything written on this phone has uploaded. */
    uploaded: () => until(async () => (await db.getUploadQueueStats()).count === 0, 'uploads'),
    /** Rows of a table in this phone's local copy. */
    rows: (sql: string, params: unknown[] = []) => db.getAll<Record<string, unknown>>(sql, params),
    close: async () => {
      attachments.dispose()
      await db.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

export type Phone = Awaited<ReturnType<typeof openPhone>>

/** Polls until `check` passes, since sync is asynchronous. */
export const until = async (
  check: () => Promise<boolean> | boolean,
  what: string,
  timeoutMs = 20_000,
) => {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await check()) return
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/** Polls a query on a phone until its rows pass `check`, and returns them. */
export const eventually = async <T>(
  read: () => Promise<T>,
  check: (value: T) => boolean,
  what: string,
): Promise<T> => {
  let value = await read()
  await until(async () => check((value = await read())), what)
  return value
}
