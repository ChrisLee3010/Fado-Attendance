// IP address and CIDR range handling for the office network check. Pure functions, no Node APIs.

export type ParsedIp = { version: 4 | 6; value: bigint };

function parseIpv4(text: string): bigint | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

function parseIpv6(text: string): bigint | null {
  let address = text;
  // An embedded IPv4 tail (::ffff:192.0.2.1) becomes two ordinary groups (::ffff:c000:201).
  const lastColon = address.lastIndexOf(":");
  if (address.slice(lastColon + 1).includes(".")) {
    const v4 = parseIpv4(address.slice(lastColon + 1));
    if (v4 === null) return null;
    address = `${address.slice(0, lastColon + 1)}${(v4 >> 16n).toString(16)}:${(v4 & 0xffffn).toString(16)}`;
  }

  const halves = address.split("::");
  if (halves.length > 2) return null;
  const toGroups = (part: string) => (part === "" ? [] : part.split(":"));
  const head = toGroups(halves[0]);
  const rest = halves.length === 2 ? toGroups(halves[1]) : [];
  const explicit = head.length + rest.length;
  if (halves.length === 1 && explicit !== 8) return null;
  if (halves.length === 2 && explicit > 7) return null;

  const groups = [...head, ...Array(halves.length === 2 ? 8 - explicit : 0).fill("0"), ...rest];
  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  return value;
}

// IPv4-mapped IPv6 addresses (::ffff:1.2.3.4) are treated as the IPv4 address they carry.
export function parseIp(raw: string): ParsedIp | null {
  const text = raw.trim().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  if (text.includes(":")) {
    const value = parseIpv6(text);
    if (value === null) return null;
    if (value >> 32n === 0xffffn) return { version: 4, value: value & 0xffffffffn };
    return { version: 6, value };
  }
  const value = parseIpv4(text);
  return value === null ? null : { version: 4, value };
}

export type Range = { version: 4 | 6; network: bigint; prefix: number };

export function parseRange(raw: string): Range | null {
  const [address, prefixText, ...extra] = raw.trim().split("/");
  if (extra.length > 0) return null;
  const ip = parseIp(address);
  if (!ip) return null;
  const bits = ip.version === 4 ? 32 : 128;
  // A mapped address written with an IPv6 prefix (::ffff:1.2.3.4/120) is rescaled to IPv4.
  let prefix = bits;
  if (prefixText !== undefined) {
    if (!/^\d{1,3}$/.test(prefixText)) return null;
    prefix = Number(prefixText);
    if (address.includes(":") && ip.version === 4) prefix -= 96;
    if (prefix < 0 || prefix > bits) return null;
  }
  return { version: ip.version, network: ip.value & mask(bits, prefix), prefix };
}

function mask(bits: number, prefix: number) {
  const all = (1n << BigInt(bits)) - 1n;
  return prefix === 0 ? 0n : (all >> BigInt(bits - prefix)) << BigInt(bits - prefix);
}

export function rangeContains(range: Range, ip: ParsedIp) {
  if (range.version !== ip.version) return false;
  const bits = ip.version === 4 ? 32 : 128;
  return (ip.value & mask(bits, range.prefix)) === range.network;
}

function formatIpv4(value: bigint) {
  return [24n, 16n, 8n, 0n].map((shift) => String((value >> shift) & 0xffn)).join(".");
}

function formatIpv6(value: bigint) {
  const groups = Array.from({ length: 8 }, (_, index) => ((value >> BigInt((7 - index) * 16)) & 0xffffn).toString(16));
  // Compress the longest run of two or more zero groups.
  let bestStart = -1;
  let bestLength = 0;
  for (let start = 0; start < 8; ) {
    if (groups[start] !== "0") {
      start += 1;
      continue;
    }
    let end = start;
    while (end < 8 && groups[end] === "0") end += 1;
    if (end - start > bestLength && end - start >= 2) [bestStart, bestLength] = [start, end - start];
    start = end;
  }
  if (bestStart === -1) return groups.join(":");
  return `${groups.slice(0, bestStart).join(":")}::${groups.slice(bestStart + bestLength).join(":")}`;
}

export function formatIp(ip: ParsedIp) {
  return ip.version === 4 ? formatIpv4(ip.value) : formatIpv6(ip.value);
}

// The canonical text stored for a range, e.g. "203.0.113.0/24" or "2001:db8:1::/64".
export function formatRange(range: Range) {
  return `${formatIp({ version: range.version, value: range.network })}/${range.prefix}`;
}

// The range an admin means by "the network I'm on now". IPv6 phones rotate the last 64 bits for privacy,
// so a single IPv6 address would stop matching within hours; the /64 is the actual network.
export function rangeForCurrentNetwork(ip: ParsedIp): Range {
  // ::1 is this computer, not a network.
  const prefix = ip.version === 4 || ip.value === 1n ? (ip.version === 4 ? 32 : 128) : 64;
  return { version: ip.version, network: ip.value & mask(ip.version === 4 ? 32 : 128, prefix), prefix };
}
