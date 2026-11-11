/** Pixel Everywhere 1.7 — deterministic view and unread-count helpers. */
export const INBOX_TABS = Object.freeze([
  { id: "private", label: "Privés", icon: "💬" },
  { id: "staff", label: "Staff", icon: "✉" },
  { id: "notifications", label: "Notifications", icon: "🔔" }
]);

export function inboxSectionForPage(pageId, directSelected = false) {
  if (pageId === "page-v17-notifications") return "notifications";
  if (pageId === "page-member-inbox") return "staff";
  if (pageId === "page-conversations") return directSelected ? "private" : "staff";
  return null;
}

export function normalizeUnread(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0
    ? Math.min(99999, Math.floor(number)) : 0;
}

export function inboxUnreadTotals({ direct, support, letters, notifications } = {}) {
  const counts = {
    private: normalizeUnread(direct),
    staff: normalizeUnread(support) + normalizeUnread(letters),
    notifications: normalizeUnread(notifications)
  };
  return { ...counts, total: counts.private + counts.staff + counts.notifications };
}

export function inboxSearchMatch(label, query) {
  const normalize = (value) => String(value || "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR").trim();
  return normalize(label).includes(normalize(query));
}
