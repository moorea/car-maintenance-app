export { authErrorKind, storedSession, supabaseAuth, type StoredSession } from './auth'
export { schema, UPLOADABLE_TABLES, type UploadableTable } from './schema'
export { createPowerSyncRepositories, type PowerSyncRepositories } from './repositories'
export { SupabaseConnector, supabaseBackend, type SupabaseAuth } from './connector'
export {
  createSyncSession,
  powerSyncSessionDatabase,
  type SyncDatabase,
  type SyncSession,
} from './session'
export {
  applyCrud,
  isPermanent,
  uploadPending,
  type BackendError,
  type CrudBackend,
} from './upload'
export { makeName, nhtsaVinDecoder } from './vinDecoder'
