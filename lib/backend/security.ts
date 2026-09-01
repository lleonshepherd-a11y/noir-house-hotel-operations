const encoder = new TextEncoder();
const PIN_ITERATIONS = 210_000;

function toHex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(value: string) {
  if (!/^[a-f0-9]+$/i.test(value) || value.length % 2 !== 0) throw new Error('Invalid hex value');
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

export function validatePin(pin: string) {
  return /^\d{4,8}$/.test(pin);
}

export async function hashPin(pin: string, suppliedSalt?: string) {
  if (!validatePin(pin)) throw new Error('PIN must contain 4 to 8 digits');
  const salt = suppliedSalt ? fromHex(suppliedSalt) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PIN_ITERATIONS },
    key,
    256,
  );
  return { hash: toHex(bits), salt: toHex(salt) };
}

export async function verifyPin(pin: string, expectedHash: string, salt: string) {
  if (!validatePin(pin)) return false;
  const candidate = await hashPin(pin, salt);
  const left = fromHex(candidate.hash);
  const right = fromHex(expectedHash);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export function createSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toHex(bytes);
}

export async function hashToken(token: string) {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
}
