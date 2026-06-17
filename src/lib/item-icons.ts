import iconPaths from "@/data/item-icon-paths.json";

export type ItemIconId = keyof typeof iconPaths;

export const ITEM_ICON_SRC = iconPaths as Record<string, string>;

export const COIN_ICON_SRC = ITEM_ICON_SRC.Coin;
export const CREDIT_ICON_SRC = ITEM_ICON_SRC.GuildCredits;

export function getMaterialIconSrc(materialId: string): string | null {
  return ITEM_ICON_SRC[materialId] ?? null;
}

export function hasItemIcon(itemId: string): boolean {
  return itemId in ITEM_ICON_SRC;
}
