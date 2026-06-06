import type { Member } from "./constants";
import {
  DEFAULT_GUILD_BUILDING_LEVELS,
  type GuildBuildingLevels,
} from "./guild-buildings-data";

export interface GuildConfig {
  guild_hall_level: number;
  guild_event_hall_level: number;
  trial_hall_level: number;
  updated_at: string;
  updated_by: Member | null;
}

export const DEFAULT_GUILD_CONFIG: GuildConfig = {
  guild_hall_level: DEFAULT_GUILD_BUILDING_LEVELS.GuildHall,
  guild_event_hall_level: DEFAULT_GUILD_BUILDING_LEVELS.GuildEventHall,
  trial_hall_level: DEFAULT_GUILD_BUILDING_LEVELS.GuildTrialHall,
  updated_at: new Date().toISOString(),
  updated_by: null,
};

export type GuildConfigUpdate = {
  guildHallLevel?: number;
  eventHallLevel?: number;
  trialHallLevel?: number;
};

export function creditHallLevelsFromConfig(
  config: GuildConfig | null,
): Pick<GuildBuildingLevels, "GuildHall" | "GuildEventHall" | "GuildTrialHall"> {
  return {
    GuildHall: config?.guild_hall_level ?? DEFAULT_GUILD_CONFIG.guild_hall_level,
    GuildEventHall: config?.guild_event_hall_level ?? DEFAULT_GUILD_CONFIG.guild_event_hall_level,
    GuildTrialHall: config?.trial_hall_level ?? DEFAULT_GUILD_CONFIG.trial_hall_level,
  };
}

export function mergeBuildingLevelsWithConfig(
  localLevels: GuildBuildingLevels,
  config: GuildConfig | null,
): GuildBuildingLevels {
  return { ...localLevels, ...creditHallLevelsFromConfig(config) };
}
