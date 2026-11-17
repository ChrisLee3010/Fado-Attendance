import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const KEY_LENGTH = 32;
const scryptAsync = promisify(scrypt);

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

// Runs on the thread pool so a burst of logins doesn't stall every other request.
export async function verifyPassword(password: string, stored: string) {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length)) as Buffer;
  return timingSafeEqual(actual, expected);
}

// Compared against when an email is unknown so response time doesn't reveal which emails exist.
export const DUMMY_HASH = hashPassword("not-a-real-password");
