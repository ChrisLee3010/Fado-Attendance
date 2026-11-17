import { test } from "node:test";
import assert from "node:assert/strict";
import { formatIp, formatRange, parseIp, parseRange, rangeContains, rangeForCurrentNetwork } from "../src/lib/ip.ts";

const inRange = (range, ip) => rangeContains(parseRange(range), parseIp(ip));

test("IPv4 addresses parse and reject junk", () => {
  assert.equal(formatIp(parseIp("203.0.113.7")), "203.0.113.7");
  assert.equal(formatIp(parseIp(" 10.0.0.1 ")), "10.0.0.1");
  for (const bad of ["", "1.2.3", "1.2.3.4.5", "256.1.1.1", "1.2.3.-4", "a.b.c.d", "1.2.3.4/24", "1..2.3"]) {
    assert.equal(parseIp(bad), null, bad);
  }
});

test("IPv6 addresses parse in every common shape", () => {
  assert.equal(formatIp(parseIp("2001:0db8:0000:0000:0000:0000:0000:0001")), "2001:db8::1");
  assert.equal(formatIp(parseIp("2001:db8::1")), "2001:db8::1");
  assert.equal(formatIp(parseIp("::1")), "::1");
  assert.equal(formatIp(parseIp("::")), "::");
  assert.equal(formatIp(parseIp("[2001:db8::1]")), "2001:db8::1");
  assert.equal(formatIp(parseIp("fe80::1%eth0")), "fe80::1");
  assert.equal(formatIp(parseIp("2001:db8:0:1:0:0:0:1")), "2001:db8:0:1::1", "compresses the longest zero run");
  for (const bad of ["1::2::3", "2001:db8::g", "1:2:3:4:5:6:7:8:9", "12345::", ":::", "1:2:3:4:5:6:7::8"]) {
    assert.equal(parseIp(bad), null, bad);
  }
});

test("IPv4-mapped IPv6 is treated as the IPv4 address it carries", () => {
  const mapped = parseIp("::ffff:203.0.113.7");
  assert.equal(mapped.version, 4);
  assert.equal(formatIp(mapped), "203.0.113.7");
  assert.equal(formatIp(parseIp("::ffff:cb00:7107")), "203.0.113.7");
  assert.ok(inRange("203.0.113.0/24", "::ffff:203.0.113.7"));
  assert.equal(formatRange(parseRange("::ffff:203.0.113.0/120")), "203.0.113.0/24");
});

test("ranges: single addresses, prefixes, and normalisation", () => {
  assert.equal(formatRange(parseRange("203.0.113.7")), "203.0.113.7/32");
  assert.equal(formatRange(parseRange("203.0.113.77/24")), "203.0.113.0/24", "host bits are cleared");
  assert.equal(formatRange(parseRange("2001:db8:1:2:3:4:5:6/64")), "2001:db8:1:2::/64");
  assert.equal(formatRange(parseRange("0.0.0.0/0")), "0.0.0.0/0");
  for (const bad of ["203.0.113.0/33", "2001:db8::/129", "203.0.113.0/", "203.0.113.0/2a", "1.2.3.4/8/8", "nope/24"]) {
    assert.equal(parseRange(bad), null, bad);
  }
});

test("membership checks, including the edges of a range", () => {
  assert.ok(inRange("203.0.113.0/24", "203.0.113.0"));
  assert.ok(inRange("203.0.113.0/24", "203.0.113.255"));
  assert.ok(!inRange("203.0.113.0/24", "203.0.114.0"));
  assert.ok(!inRange("203.0.113.0/24", "203.0.112.255"));
  assert.ok(inRange("203.0.113.7", "203.0.113.7"));
  assert.ok(!inRange("203.0.113.7", "203.0.113.8"));
  assert.ok(inRange("2001:db8:1:2::/64", "2001:db8:1:2:aaaa:bbbb:cccc:dddd"));
  assert.ok(!inRange("2001:db8:1:2::/64", "2001:db8:1:3::1"));
  assert.ok(!inRange("0.0.0.0/0", "2001:db8::1"), "IPv4 and IPv6 never match each other");
});

test("'the network I'm on now' is the exact IPv4 address, or the IPv6 /64", () => {
  assert.equal(formatRange(rangeForCurrentNetwork(parseIp("203.0.113.7"))), "203.0.113.7/32");
  assert.equal(formatRange(rangeForCurrentNetwork(parseIp("2001:db8:1:2:aaaa:bbbb:cccc:dddd"))), "2001:db8:1:2::/64");
  assert.equal(formatRange(rangeForCurrentNetwork(parseIp("::1"))), "::1/128", "IPv6 loopback stays a single address");
});
