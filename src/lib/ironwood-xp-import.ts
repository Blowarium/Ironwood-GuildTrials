import { SKILLS, type Skill } from "./constants";
import {
  findCatalogAction,
  resolveProfileActionId,
} from "./ironwood-action-catalog";

export const IRONWOOD_ORIGIN = "https://ironwoodrpg.com";
export const XP_IMPORT_RETURN_KEY = "ironwood-guild-trials-xp-import-return";
export const XP_IMPORT_SCRIPT_PATH = "/ironwood-xp-import.js";
export const XP_IMPORT_USERSCRIPT_PATH = "/ironwood-xp-import.user.js";
export const XP_IMPORT_HELPER_STORAGE_KEY = "igt-xp-import-helper-installed";
export const TAMPERMONKEY_HOME_URL = "https://www.tampermonkey.net/";

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

export type IronwoodXpImportActionSource = {
  actionId: number;
  name: string;
  level?: number | null;
  url: string;
  method?: "component" | "dom";
  xpPerHour?: number;
};

export type IronwoodActionPlanEntry = {
  actionId: number;
  path: string;
  name: string;
};

export type IronwoodActionPlan = Partial<Record<Skill, IronwoodActionPlanEntry>>;

export function buildIronwoodActionPlanFromRows(
  rows: Array<{ skill: Skill; ironwood_action_id: number | null }>,
): IronwoodActionPlan {
  const plan: IronwoodActionPlan = {};
  for (const row of rows) {
    const actionId = resolveProfileActionId(row.skill, row.ironwood_action_id);
    if (actionId == null) continue;
    const action = findCatalogAction(row.skill, actionId);
    if (!action?.path) continue;
    plan[row.skill] = {
      actionId: action.actionId,
      path: action.path,
      name: action.name,
    };
  }
  return plan;
}

export function encodeIronwoodActionPlan(plan: IronwoodActionPlan): string {
  const json = JSON.stringify({ v: 1, plan });
  if (typeof btoa === "function") {
    return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeIronwoodActionPlan(encoded: string): IronwoodActionPlan | null {
  try {
    let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json =
      typeof atob === "function"
        ? atob(b64)
        : Buffer.from(b64, "base64").toString("utf8");
    const parsed = JSON.parse(json) as { v?: number; plan?: IronwoodActionPlan };
    if (parsed?.v !== 1 || !parsed.plan) return null;
    return parsed.plan;
  } catch {
    return null;
  }
}

export type IronwoodXpImportPayload = {
  v: 1;
  importedAt: string;
  skills: Partial<Record<Skill, number>>;
  errors?: Partial<Record<Skill, string>>;
  /** Debug: which Ironwood action was used per skill. */
  actionSources?: Partial<Record<Skill, IronwoodXpImportActionSource>>;
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

export function buildIronwoodXpImportBookmarklet(
  appOrigin: string,
  returnUrl: string,
  actionPlan?: IronwoodActionPlan,
): string {
  const code = buildIronwoodXpImportConsoleSnippet(appOrigin, returnUrl, actionPlan);
  return `javascript:${encodeURIComponent(code)}`;
}

export function buildIronwoodImportLaunchUrl(
  returnUrl: string,
  actionPlan?: IronwoodActionPlan,
): string {
  const url = new URL(IRONWOOD_ORIGIN);
  url.searchParams.set("igtXpImport", "1");
  url.searchParams.set("igtReturn", returnUrl);
  if (actionPlan && Object.keys(actionPlan).length > 0) {
    url.searchParams.set("igtActions", encodeIronwoodActionPlan(actionPlan));
  }
  return url.toString();
}

export function buildIronwoodXpImportConsoleSnippet(
  appOrigin: string,
  returnUrl: string,
  actionPlan?: IronwoodActionPlan,
): string {
  let src = `${appOrigin.replace(/\/$/, "")}${XP_IMPORT_SCRIPT_PATH}?return=${encodeURIComponent(returnUrl)}`;
  if (actionPlan && Object.keys(actionPlan).length > 0) {
    src += `&actions=${encodeURIComponent(encodeIronwoodActionPlan(actionPlan))}`;
  }
  return `(function(){var s=document.createElement('script');s.src='${src}';document.body.appendChild(s);})();`;
}

/** Direct .user.js URL — Tampermonkey intercepts this and shows its install dialog. */
export function buildUserscriptInstallUrl(appOrigin: string): string {
  return `${appOrigin.replace(/\/$/, "")}${XP_IMPORT_USERSCRIPT_PATH}`;
}

/** @deprecated Use buildUserscriptInstallUrl — script_installation.php often shows a dead-end page. */
export function buildTampermonkeyInstallUrl(appOrigin: string): string {
  return buildUserscriptInstallUrl(appOrigin);
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
