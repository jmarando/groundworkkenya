import { describe, expect, it } from "vitest";
import { parsePollRecipients } from "../src/lib/poll-recipients";

describe("individual poll recipients", () => {
  it("normalizes and deduplicates Kenyan numbers", () => {
    expect(parsePollRecipients("0725252542\n+254 725 252542", "whatsapp")).toEqual(["+254725252542"]);
  });
  it("normalizes email addresses and accepts comma-separated lists", () => {
    expect(parsePollRecipients("Justin@example.com, JUSTIN@example.com; other@example.com", "email")).toEqual(["justin@example.com", "other@example.com"]);
  });
  it("rejects invalid addresses instead of silently dropping them", () => {
    expect(() => parsePollRecipients("not-an-email", "email")).toThrow("Check this email");
    expect(() => parsePollRecipients("123", "whatsapp")).toThrow("Check this phone");
  });
  it("rejects empty and oversized recipient lists", () => {
    expect(() => parsePollRecipients("", "email")).toThrow("at least one");
    expect(() => parsePollRecipients(Array.from({ length: 21 }, (_, i) => `person${i}@example.com`).join("\n"), "email")).toThrow("up to 20");
  });
});