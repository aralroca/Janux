/**
 * The upload contract, shared by both ends: the client dropzone filters with
 * it (a rejected file never even leaves the browser) and the multipart
 * handler re-enforces it (a raw POST cannot bypass the rules).
 */
export const ACCEPT = ['image/*'];
export const MAX_SIZE_BYTES = 1024 * 1024; // 1 MB
