const DISCORD_API = "https://discord.com/api/v10";

function cleanDiscordContent(content) {
  return content
    .replace(/<@!?(\d+)>/g, "@membre")
    .replace(/<@&(\d+)>/g, "@rôle")
    .replace(/<#(\d+)>/g, "#salon");
}

export async function fetchAnnouncements() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_ANNOUNCEMENT_CHANNEL_ID;

  if (!token || !channelId) {
    return { configured: false, announcements: [] };
  }

  const response = await fetch(
    `${DISCORD_API}/channels/${channelId}/messages?limit=30`,
    {
      headers: {
        Authorization: `Bot ${token}`,
        "User-Agent": "PixelEverywhere/0.1"
      },
      signal: AbortSignal.timeout(8000)
    }
  );

  if (!response.ok) {
    const error = new Error(`Discord a répondu ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  const messages = await response.json();
  return {
    configured: true,
    announcements: messages
      .filter((message) => message.type === 0)
      .map((message) => ({
        id: message.id,
        content: cleanDiscordContent(message.content || ""),
        createdAt: message.timestamp,
        author: {
          username: message.author?.global_name || message.author?.username || "PDD",
          avatarUrl: message.author?.avatar
            ? `https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}.png?size=128`
            : null
        },
        attachments: (message.attachments || []).map((attachment) => ({
          id: attachment.id,
          filename: attachment.filename,
          url: attachment.url,
          contentType: attachment.content_type || ""
        })),
        embeds: (message.embeds || []).map((embed) => ({
          title: embed.title || "",
          description: embed.description || "",
          url: embed.url || ""
        }))
      }))
      .reverse()
  };
}

