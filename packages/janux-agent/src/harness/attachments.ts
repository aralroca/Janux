/**
 * Attachment intake (RFC 0002 §23, assistant parity): validates incoming
 * files, assigns stable `att_N` refs the model can cite, and bounds the
 * request. Blob offload is a storage concern (S3/MinIO adapter app-side).
 */

export interface IncomingAttachment {
  name: string;
  mediaType: string;
  /** Base64 payload or a storage marker (`s3://…`). */
  data: string;
}

export interface AcceptedAttachment extends IncomingAttachment {
  ref: string;
  bytes: number;
}

export interface AttachmentPolicy {
  allowedTypes?: string[];
  maxFiles?: number;
  maxFileBytes?: number;
  maxRequestBytes?: number;
}

const DEFAULTS: Required<AttachmentPolicy> = {
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  maxFiles: 4,
  maxFileBytes: 10 * 1024 * 1024,
  maxRequestBytes: 15 * 1024 * 1024,
};

export class AttachmentError extends Error {
  constructor(readonly code: 'too_many' | 'bad_type' | 'too_big' | 'request_too_big') {
    super(code);
  }
}

function base64Bytes(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;

  return Math.floor((data.length * 3) / 4) - padding;
}

/** Validates a message's attachments and assigns stable att_N refs (1-based). */
export function acceptAttachments(
  incoming: IncomingAttachment[],
  policy: AttachmentPolicy = {},
): AcceptedAttachment[] {
  const rules = { ...DEFAULTS, ...policy };

  if (incoming.length > rules.maxFiles) throw new AttachmentError('too_many');
  let total = 0;
  const accepted = incoming.map((attachment, index) => {
    if (!rules.allowedTypes.includes(attachment.mediaType)) throw new AttachmentError('bad_type');
    const bytes = attachment.data.startsWith('s3://') ? 0 : base64Bytes(attachment.data);

    if (bytes > rules.maxFileBytes) throw new AttachmentError('too_big');
    total += bytes;

    return { ...attachment, ref: `att_${index + 1}`, bytes };
  });

  if (total > rules.maxRequestBytes) throw new AttachmentError('request_too_big');

  return accepted;
}
