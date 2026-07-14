import { describe, expect, it, vi } from 'vitest';

import { fingerprintBytes, readUtf8JsonFile } from '../../src/storage/fingerprint';

const encoder = new TextEncoder();

describe('fingerprintBytes', () => {
  it('returns the known lowercase SHA-256 digest for the same exact bytes', async () => {
    const bytes = encoder.encode('abc');

    const first = await fingerprintBytes(bytes);
    const second = await fingerprintBytes(bytes);

    expect(first).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(second).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different fingerprints for different byte content', async () => {
    await expect(fingerprintBytes(encoder.encode('a'))).resolves.not.toBe(
      await fingerprintBytes(encoder.encode('b')),
    );
  });

  it('hashes only the bytes inside an offset view', async () => {
    const backingBytes = new Uint8Array([0x78, 0x61, 0x62, 0x63, 0x79]);

    await expect(fingerprintBytes(backingBytes.subarray(1, 4))).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('readUtf8JsonFile', () => {
  it('reads bytes once and returns their UTF-8 text and matching fingerprint', async () => {
    const text = '{"name":"田块"}';
    const bytes = encoder.encode(text);
    const file = new File([bytes], 'annotation.json', { type: 'application/json' });
    const arrayBuffer = vi.spyOn(file, 'arrayBuffer');

    await expect(readUtf8JsonFile(file)).resolves.toEqual({
      text,
      fingerprint: await fingerprintBytes(bytes),
    });
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid UTF-8 instead of replacing malformed bytes', async () => {
    const file = new File([new Uint8Array([0xc3, 0x28])], 'invalid.json');

    await expect(readUtf8JsonFile(file)).rejects.toBeInstanceOf(TypeError);
  });
});
