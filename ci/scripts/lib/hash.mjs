/**
 * hash.mjs — streaming SHA-256, shared by everything that hashes an artifact.
 *
 * Extracted from `make-checksums.mjs` when `generate-release-manifest.mjs`
 * needed the same digest of the same files. Two independent implementations of
 * "the SHA-256 of a release artifact" is precisely the kind of duplication that
 * eventually publishes a manifest disagreeing with `SHA256SUMS`.
 *
 * Streaming rather than `readFile`: release artifacts are hundreds of megabytes
 * and CI runners are not generous with memory.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/**
 * @param {string} file
 * @returns {Promise<string>} lowercase hex digest
 */
export function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}
