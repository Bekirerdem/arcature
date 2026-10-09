import { describe, expect, test } from "bun:test";
import { parseUnits } from "viem";
import { pays } from "./collections";

const u = (s: string) => parseUnits(s, 6);

describe("pays", () => {
  test("exact amount pays", () => expect(pays(u("250"), u("250"))).toBe(true));
  test("a fast-transfer overpay within 0.5% pays", () => expect(pays(u("250.9"), u("250"))).toBe(true));
  test("more than 0.5% over does not pay", () => expect(pays(u("252"), u("250"))).toBe(false));
  test("short by one micro-dollar does not pay", () => expect(pays(u("249.999999"), u("250"))).toBe(false));
});
