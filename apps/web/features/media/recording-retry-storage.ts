export const recordingRetryStoragePrefix = "w6.recording-delivery:";
export const recordingRetryIdentityStorage = "w6.recording-delivery-session";

/** Optional retry metadata never supplies request or publication authority. */
export function purgeRecordingRetries() {
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith(recordingRetryStoragePrefix))
        sessionStorage.removeItem(key);
    sessionStorage.removeItem(recordingRetryIdentityStorage);
  } catch {
    // The actual issuer-bound request remains mandatory without storage.
  }
}
