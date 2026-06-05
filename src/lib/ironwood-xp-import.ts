import { SKILLS, type Skill } from "./constants";

export const IRONWOOD_ORIGIN = "https://ironwoodrpg.com";
export const XP_IMPORT_RETURN_KEY = "ironwood-guild-trials-xp-import-return";
export const XP_IMPORT_SCRIPT_PATH = "/ironwood-xp-import.js";
export const XP_IMPORT_USERSCRIPT_PATH = "/ironwood-xp-import.user.js";
export const XP_IMPORT_HELPER_STORAGE_KEY = "igt-xp-import-helper-installed";
export const TAMPERMONKEY_HOME_URL = "https://www.tampermonkey.net/";
export const TAMPERMONKEY_INSTALL_URL =
  "https://www.tampermonkey.net/script_installation.php";

/** Ironwood sidebar display name → guild trials skill. */
export const IRONWOOD_SKILL_NAME_MAP: Record<string, Skill> = {
  Woodcutting: "Woodcutting",
  Mining: "Mining",
  Smelting: "Smelting",
  Smithing: "Smithing",
  Enchanting: "Enchanting",
  Farming: "Farming",
  Alchemy: "Alchemy",
  Fishing: "Fishing",
  Cooking: "Cooking",
  Delving: "Delving",
  Imbuing: "Imbuing",
  Exploring: "Exploring",
  "One-handed": "One-handed",
  "Two-handed": "Two-handed",
  Ranged: "Ranged",
  Defense: "Defense",
};

export const GUILD_TRIAL_SKILLS = SKILLS;

export type IronwoodXpImportPayload = {
  v: 1;
  importedAt: string;
  skills: Partial<Record<Skill, number>>;
  errors?: Partial<Record<Skill, string>>;
};

export function mapIronwoodSkillName(name: string): Skill | null {
  const trimmed = name.trim();
  return IRONWOOD_SKILL_NAME_MAP[trimmed] ?? null;
}

export function encodeXpImportPayload(payload: IronwoodXpImportPayload): string {
  const json = JSON.stringify(payload);
  if (typeof btoa === "function") {
    return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeXpImportPayload(encoded: string): IronwoodXpImportPayload | null {
  try {
    let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json =
      typeof atob === "function"
        ? atob(b64)
        : Buffer.from(b64, "base64").toString("utf8");
    const parsed = JSON.parse(json) as IronwoodXpImportPayload;
    if (parsed?.v !== 1 || !parsed.skills) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildIronwoodXpImportBookmarklet(appOrigin: string, returnUrl: string): string {
  const code = buildIronwoodXpImportConsoleSnippet(appOrigin, returnUrl);
  return `javascript:${encodeURIComponent(code)}`;
}

export function buildIronwoodXpImportConsoleSnippet(
  appOrigin: string,
  returnUrl: string,
): string {
  const src = `${appOrigin.replace(/\/$/, "")}${XP_IMPORT_SCRIPT_PATH}?return=${encodeURIComponent(returnUrl)}`;
  return `(function(){var s=document.createElement('script');s.src='${src}';document.body.appendChild(s);})();`;
}

export function buildTampermonkeyInstallUrl(appOrigin: string): string {
  const source = `${appOrigin.replace(/\/$/, "")}${XP_IMPORT_USERSCRIPT_PATH}`;
  return `${TAMPERMONKEY_INSTALL_URL}?source=${encodeURIComponent(source)}`;
}

export function buildIronwoodImportLaunchUrl(returnUrl: string): string {
  const url = new URL(IRONWOOD_ORIGIN);
  url.searchParams.set("igtXpImport", "1");
  url.searchParams.set("igtReturn", returnUrl);
  return url.toString();
}

export function isXpImportHelperInstalled(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(XP_IMPORT_HELPER_STORAGE_KEY) === "1";
}

export function markXpImportHelperInstalled(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(XP_IMPORT_HELPER_STORAGE_KEY, "1");
}

export function readXpImportFromLocation(search: string): IronwoodXpImportPayload | null {
  const params = new URLSearchParams(search);
  const encoded = params.get("xpImport");
  if (!encoded) return null;
  return decodeXpImportPayload(encoded);
}

export function applyXpImportToRows<T extends { skill: Skill; xp_per_hour: number | null }>(
  rows: T[],
  payload: IronwoodXpImportPayload,
): T[] {
  return rows.map((row) => {
    const xp = payload.skills[row.skill];
    if (xp == null || xp <= 0) return row;
    return { ...row, xp_per_hour: xp };
  });
}
