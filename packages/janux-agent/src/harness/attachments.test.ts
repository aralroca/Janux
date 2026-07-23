import { describe, expect, it } from 'bun:test';
import { acceptAttachments, AttachmentError } from './attachments';

const png = (bytes: number) => ({
  name: 'a.png',
  mediaType: 'image/png',
  data: btoa('x'.repeat(bytes)),
});

describe('attachment intake', () => {
  it('assigns stable att_N refs in order', () => {
    const accepted = acceptAttachments([png(10), { ...png(10), name: 'b.png' }]);

    expect(accepted.map((a) => a.ref)).toEqual(['att_1', 'att_2']);
    expect(accepted[0]!.bytes).toBe(10);
  });

  it('rejects disallowed types, oversize files and oversize requests', () => {
    expect(() => acceptAttachments([{ name: 'x.exe', mediaType: 'application/x-exe', data: 'aa' }])).toThrow(
      new AttachmentError('bad_type'),
    );
    expect(() => acceptAttachments([png(50)], { maxFileBytes: 10 })).toThrow(new AttachmentError('too_big'));
    expect(() => acceptAttachments([png(30), { ...png(30), name: 'b.png' }], { maxRequestBytes: 40 })).toThrow(
      new AttachmentError('request_too_big'),
    );
    expect(() => acceptAttachments([png(1), png(1), png(1)], { maxFiles: 2 })).toThrow(
      new AttachmentError('too_many'),
    );
  });

  it('s3 markers pass through without counting bytes', () => {
    const accepted = acceptAttachments([{ name: 'big.pdf', mediaType: 'application/pdf', data: 's3://bucket/key' }]);

    expect(accepted[0]!.bytes).toBe(0);
  });
});
