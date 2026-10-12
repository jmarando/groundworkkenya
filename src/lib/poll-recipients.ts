import { normalizeKePhone } from "@/lib/phone";

export function parsePollRecipients(value: string, channel: "whatsapp" | "email") {
  const entries = value.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  if (entries.length > 20) throw new Error("Send to up to 20 individual recipients at a time.");
  if (!entries.length) throw new Error("Add at least one recipient.");
  return [...new Set(entries.map((entry) => {
    if (channel === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry) || entry.length > 254)
        throw new Error(`Check this email address: ${entry}`);
      return entry.toLowerCase();
    }
    const phone = normalizeKePhone(entry);
    if (!phone) throw new Error(`Check this phone number: ${entry}`);
    return phone;
  }))];
}