import type { Member } from "./constants";

export interface GuildConfig {
  trial_hall_level: number;
  updated_at: string;
  updated_by: Member | null;
}

export const DEFAULT_GUILD_CONFIG: GuildConfig = {
  trial_hall_level: 0,
  updated_at: new Date().toISOString(),
  updated_by: null,
};
