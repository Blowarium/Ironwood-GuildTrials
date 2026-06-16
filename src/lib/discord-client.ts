import type { DiscordConfig, DiscordPingMode } from "./discord-env";

/** Discord MessageFlags.SUPPRESS_EMBEDS — hide link preview cards. */
const SUPPRESS_EMBEDS = 1 << 2;

export type DiscordAllowedMentions = {
  parse?: ("roles" | "users" | "everyone")[];
  roles?: string[];
  users?: string[];
};

export function allowedMentionsForPing(
  pingMode: DiscordPingMode,
  pingRoleId: string | null,
): DiscordAllowedMentions {
  if (pingMode === "everyone") {
    return { parse: ["everyone"] };
  }
  if (pingMode === "role" && pingRoleId) {
    return { parse: [], roles: [pingRoleId] };
  }
  return { parse: [] };
}

export function pingPrefix(pingMode: DiscordPingMode, pingRoleId: string | null): string {
  if (pingMode === "everyone") return "@everyone\n\n";
  if (pingMode === "role" && pingRoleId) return `<@&${pingRoleId}>\n\n`;
  return "";
}

export async function postDiscordChannelMessage(
  config: DiscordConfig,
  content: string,
  allowedMentions?: DiscordAllowedMentions,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `https://discord.com/api/v10/channels/${config.channelId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${config.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: content.slice(0, 2000),
        allowed_mentions: allowedMentions ?? { parse: [] },
        flags: SUPPRESS_EMBEDS,
      }),
    },
  );

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) detail = body.message;
    } catch {
      /* ignore */
    }
    return { ok: false, error: `Discord API ${res.status}: ${detail}` };
  }

  return { ok: true };
}

export async function postDiscordMessages(
  config: DiscordConfig,
  chunks: string[],
  pingMode: DiscordPingMode,
  pingRoleId: string | null,
): Promise<{ ok: true; messageCount: number } | { ok: false; error: string }> {
  const mentions = allowedMentionsForPing(pingMode, pingRoleId);
  for (let i = 0; i < chunks.length; i++) {
    const content =
      i === 0 ? pingPrefix(pingMode, pingRoleId) + chunks[i] : chunks[i];
    const result = await postDiscordChannelMessage(config, content, i === 0 ? mentions : { parse: [] });
    if (!result.ok) return result;
  }
  return { ok: true, messageCount: chunks.length };
}
