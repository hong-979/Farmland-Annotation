export async function fingerprintBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function readUtf8JsonFile(
  file: File,
): Promise<{ text: string; fingerprint: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);

  return { text, fingerprint: await fingerprintBytes(bytes) };
}
