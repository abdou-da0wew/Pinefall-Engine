/** Encoded capacity is separate from decoded/render memory. MB here means decimal bytes. */
export const IMPORT_BYTES = 200_000_000;
export const MODEL_BYTES = 200_000_000;
export const PROJECT_MODEL_BYTES = 480_000_000;
export const BASE64_MODEL_CHARS = Math.ceil(MODEL_BYTES / 3) * 4 + 128;
export const BASE64_PROJECT_CHARS = Math.ceil(PROJECT_MODEL_BYTES / 3) * 4 + 8192;
export const ARCHIVE_BYTES = 512 * 1024 * 1024;
export const DECODED_MODEL_BYTES = 256 * 1024 * 1024;
