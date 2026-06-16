export type DiscordPingMode = "everyone" | "role" | "none";

export type DiscordConfig = {
  botToken: string;
  channelId: string;
  pingMode: DiscordPingMode;
  pingRoleId: string | null;
  cronSecret: string | null;
};

export function readDiscordConfig(): DiscordConfig | null {
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
  const channelId = process.env.DISCORD_CHANNEL_ID?.trim();
  if (!botToken || !channelId) return null;

  const pingRaw = (process.env.DISCORD_PING_MODE ?? "role").toLowerCase();
  const pingMode: DiscordPingMode =
    pingRaw === "everyone" ? "everyone" : pingRaw === "none" ? "none" : "role";

  return {
    botToken,
    channelId,
    pingMode,
    pingRoleId: process.env.DISCORD_PING_ROLE_ID?.trim() || null,
    cronSecret: process.env.CRON_SECRET?.trim() || null,
  };
}

export function isDiscordConfigured(): boolean {
  return readDiscordConfig() !== null;
}
