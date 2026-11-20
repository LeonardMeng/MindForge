/**
 * 文本按 UTF-8 编码后的 SHA-256，十六进制小写。用 Web Crypto（Node、浏览器和 Tauri 都有），
 * 不用 `node:crypto`。
 */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
