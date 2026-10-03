/**
 * Šifrování rodičovské kontroly (jen v telefonech, Web Crypto):
 * každé zařízení má vlastní pár klíčů ECDH P-256 (soukromý klíč nejde z prohlížeče vytáhnout),
 * ze sdíleného tajemství se přes HKDF odvodí klíč AES-GCM 256 pro jedno spojení rodič ↔ dítě.
 */
const enc = new TextEncoder(), dec = new TextDecoder();
export const b64u = {
  from(buf: ArrayBuffer | Uint8Array): string { const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf); let s = ''; b.forEach((x) => { s += String.fromCharCode(x); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  to(s: string): Uint8Array { const p = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); },
};
const subtle = () => globalThis.crypto.subtle;

export async function newKeyPair(): Promise<{ privateKey: CryptoKey; pub: string }> {
  const kp = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const raw = await subtle().exportKey('raw', kp.publicKey);
  return { privateKey: kp.privateKey, pub: b64u.from(raw) };
}

/** Klíč spojení: ECDH → HKDF(SHA-256, sůl = id spojení) → AES-GCM 256, nevyexportovatelný. */
export async function linkKey(privateKey: CryptoKey, peerPub: string, linkId: string): Promise<CryptoKey> {
  const peer = await subtle().importKey('raw', b64u.to(peerPub) as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const bits = await subtle().deriveBits({ name: 'ECDH', public: peer }, privateKey, 256);
  const hk = await subtle().importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode(linkId), info: enc.encode('dopravacr-family-v1') }, hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function seal(key: CryptoKey, data: unknown): Promise<{ ct: string; iv: string }> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)));
  return { ct: b64u.from(ct), iv: b64u.from(iv) };
}
export async function open<T>(key: CryptoKey, ct: string, iv: string): Promise<T | null> {
  try {
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: b64u.to(iv) as BufferSource }, key, b64u.to(ct) as BufferSource);
    return JSON.parse(dec.decode(pt)) as T;
  } catch { return null; }
}

/** Otisk veřejného klíče rodiče v QR kódu – dítě ověří, že mu server nepodstrčil cizí klíč. */
export async function fingerprint(pub: string): Promise<string> {
  return b64u.from(await subtle().digest('SHA-256', b64u.to(pub) as BufferSource)).slice(0, 22);
}

const EMOJI = ['🚋', '🚇', '🚌', '🚆', '⛴️', '🚠', '🌳', '🌻', '🍎', '🍐', '🍒', '🍋', '🥨', '🧁', '🍪', '🎈', '🎨', '🎸', '🎲', '🧩', '⚽', '🏀', '🎯', '🚀', '⭐', '🌙', '☀️', '🌈', '❄️', '🔥', '💧', '🍀', '🐶', '🐱', '🐭', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦉', '🐢', '🐬', '🐳', '🦋', '🐞', '🦄', '🐙', '🦀', '🍉', '🍓', '🥕', '🌵', '🏰', '🗽'];
/** Ověřovací obrázky: stejné na obou telefonech jen tehdy, když spolu mluví opravdu ty dva telefony. */
export async function verifyEmojis(pubA: string, pubB: string): Promise<string[]> {
  const [x, y] = [pubA, pubB].sort();
  const h = new Uint8Array(await subtle().digest('SHA-256', enc.encode(`${x}|${y}`)));
  return [0, 1, 2, 3].map((i) => EMOJI[h[i]! % EMOJI.length]!);
}
