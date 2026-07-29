/**
 * @typedef {"local" | "supabase"} FileStorageProviderName
 *
 * @typedef {Object} PutObjectInput
 * @property {string} storageKey
 * @property {Buffer | Uint8Array} bytes
 * @property {string} contentType
 * @property {string} originalFilename
 * @property {number} size
 * @property {string=} cacheControl
 *
 * @typedef {Object} StoredObject
 * @property {FileStorageProviderName} provider
 * @property {string} storageKey
 * @property {number} size
 * @property {string} contentType
 * @property {string} checksum
 * @property {string} databasePath
 *
 * @typedef {Object} DownloadDescriptor
 * @property {FileStorageProviderName} provider
 * @property {string} storageKey
 * @property {string} url
 * @property {Date | null} expiresAt
 *
 * @typedef {Object} RetrievedObject
 * @property {FileStorageProviderName} provider
 * @property {string} storageKey
 * @property {Buffer} bytes
 * @property {number} size
 * @property {string} contentType
 *
 * @typedef {Object} FileStorageProvider
 * @property {FileStorageProviderName} name
 * @property {(input: PutObjectInput) => Promise<StoredObject>} putObject
 * @property {(storageKey: string) => Promise<RetrievedObject>} getObject
 * @property {(storageKey: string) => Promise<DownloadDescriptor>} getDownloadDescriptor
 * @property {(storageKey: string, expiresInSeconds?: number) => Promise<DownloadDescriptor>} createSignedDownloadUrl
 * @property {(storageKey: string) => Promise<boolean>} deleteObject
 * @property {(storageKey: string) => Promise<boolean>} objectExists
 */

export {};
