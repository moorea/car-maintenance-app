export { authErrorKind, storedSession, supabaseAuth, type StoredSession } from './auth'
export { schema, UPLOADABLE_TABLES, type UploadableTable } from './schema'
export { createPowerSyncRepositories, type PowerSyncRepositories } from './repositories'
export {
  SupabaseConnector,
  supabaseBackend,
  type SupabaseAuth,
  type SupabaseClientConnectorOptions,
  type SupabaseConnectorOptions,
} from './connector'
export {
  createAttachmentRepo,
  type AttachmentRepoOptions,
  type PowerSyncAttachmentRepo,
} from './attachments'
export type { DeviceFiles } from './files'
export {
  attachmentDownloadUrl,
  supabaseStorage,
  type AttachmentStorage,
  type DownloadUrlOptions,
  type StorageOptions,
} from './storage'
export {
  createSyncSession,
  powerSyncSessionDatabase,
  type SyncDatabase,
  type SyncSession,
} from './session'
export {
  applyCrud,
  attachmentPath,
  isPermanent,
  uploadPending,
  type BackendError,
  type CrudBackend,
  type UploadContext,
} from './upload'
export { makeName, nhtsaVinDecoder } from './vinDecoder'
export { storedReminderSettings } from './reminderSettings'
export { storedDevicePreferences } from './devicePreferences'
export { supabaseAccount, type RpcResult } from './account'
export * from './assistant'
export * from './quoteReader'
