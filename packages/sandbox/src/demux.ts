export type StreamKind = 'stdout' | 'stderr';

const HEADER_BYTES = 8;

/**
 * Splits Docker's multiplexed attach stream (used when the exec has no TTY) into stdout and
 * stderr chunks. Each frame is an 8-byte header — stream type, 3 zero bytes, big-endian
 * payload length — followed by the payload. Frames may arrive split across chunks.
 */
export function createDemuxer(onData: (kind: StreamKind, data: Uint8Array) => void) {
  let buffer: Buffer = Buffer.alloc(0);

  return (chunk: Buffer): void => {
    buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
    while (buffer.length >= HEADER_BYTES) {
      const size = buffer.readUInt32BE(4);
      if (buffer.length < HEADER_BYTES + size) return;
      const payload = buffer.subarray(HEADER_BYTES, HEADER_BYTES + size);
      // 1 = stdout, 2 = stderr; 0 (stdin) never comes back from Docker.
      onData(buffer[0] === 2 ? 'stderr' : 'stdout', payload);
      buffer = buffer.subarray(HEADER_BYTES + size);
    }
  };
}
