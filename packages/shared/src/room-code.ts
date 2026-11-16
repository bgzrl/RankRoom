export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 5;
export const ROOM_CODE_REGEX = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/;

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_REGEX.test(normalizeRoomCode(code));
}

export function generateRoomCode(
  randomBytesFn: (length: number) => Uint8Array = (length) => {
    const buffer = new Uint8Array(length);
    globalThis.crypto.getRandomValues(buffer);
    return buffer;
  },
): string {
  const alphabetLength = ROOM_CODE_ALPHABET.length;
  const maxValidByte = Math.floor(256 / alphabetLength) * alphabetLength;
  let result = '';

  while (result.length < ROOM_CODE_LENGTH) {
    const bytes = randomBytesFn(ROOM_CODE_LENGTH * 2);
    for (let i = 0; i < bytes.length && result.length < ROOM_CODE_LENGTH; i += 1) {
      const byte = bytes[i];
      if (byte !== undefined && byte < maxValidByte) {
        result += ROOM_CODE_ALPHABET[byte % alphabetLength];
      }
    }
  }

  return result;
}
