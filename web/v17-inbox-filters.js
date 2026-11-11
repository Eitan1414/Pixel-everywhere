/** Local-only pinning and deterministic thread filters. No message bodies stored. */
export const INBOX_FILTERS = Object.freeze([
  { id: "all", label: "Toutes" },
  { id: "unread", label: "Non lues" },
  { id: "recent", label: "Récentes · 7 j" },
  { id: "pinned", label: "Épinglées" }
]);

export const RECENT_DAYS = 7;
const ID_PATTERN = /^\d{1,18}$/;

export function normalizedPinnedIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id) => typeof id === "string" && ID_PATTERN.test(id)))].slice(0, 200);
}

/** SQLite timestamps without a timezone use UTC just like the existing UI. */
export function conversationTimestamp(input) {
  if (typeof input !== "string" || !input.trim()) return 0;
  const value = input.trim().replace(" ", "T");
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : value + "Z";
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function visibleConversation(thread, {filter = "all", query = "", pins = [], now = Date.now()} = {}) {
  const pinned = new Set(normalizedPinnedIds(pins));
  if (query && !String(thread.text || "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR")
    .includes(String(query).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr-FR").trim())) return false;
  if (filter === "unread") return Number(thread.unread) > 0;
  if (filter === "pinned") return pinned.has(String(thread.id));
  if (filter === "recent") {
    const time = conversationTimestamp(thread.updatedAt);
    return time > 0 && time <= now && now - time <= RECENT_DAYS * 86400000;
  }
  return true;
}

export function sortConversations(threads, pins = []) {
  const pinned = new Set(normalizedPinnedIds(pins));
  return [...threads].sort((a, b) => {
    const aPin = pinned.has(String(a.id)) ? 1 : 0;
    const bPin = pinned.has(String(b.id)) ? 1 : 0;
    if (aPin !== bPin) return bPin - aPin;
    const diff = conversationTimestamp(b.updatedAt) - conversationTimestamp(a.updatedAt);
    if (diff) return diff;
    return Number(a.order ?? 0) - Number(b.order ?? 0);
  });
}
