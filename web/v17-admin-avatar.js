/** A staff avatar must refer to the member profile linked to that very staff account. */
export function hasLinkedStaffMember(staff, member, token) {
  return Boolean(token && staff?.id != null && member?.id != null &&
    member.staffLinked === true && Number(member.staffId) === Number(staff.id));
}

/** Only accept official URLs created by the PE Discord linking backend. */
export function safeStaffDiscordAvatarUrl(payload) {
  if (!payload?.linked || typeof payload?.discord?.avatarUrl !== "string") return "";
  try {
    const url = new URL(payload.discord.avatarUrl);
    if (url.protocol !== "https:" || url.hostname !== "cdn.discordapp.com" ||
        url.username || url.password || url.hash) return "";
    if (!/^\/(?:avatars\/\d{15,25}\/(?:a_)?[a-f0-9]{32}\.webp|embed\/avatars\/[0-5]\.png)$/i.test(url.pathname)) return "";
    if (url.search && !/^\?size=128(?:&animated=true)?$/.test(url.search)) return "";
    return url.href;
  } catch { return ""; }
}
