/**
 * Export Ironwood action dropdown labels and import URLs to CSV.
 * Run: node scripts/print-action-labels.mjs
 */
import fs from "fs";
import path from "path";

const catalog = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "public/ironwood-action-catalog.json"), "utf8"),
);

const SKILLS = [
  "Woodcutting",
  "Mining",
  "Smelting",
  "Smithing",
  "Enchanting",
  "Farming",
  "Alchemy",
  "Fishing",
  "Cooking",
  "Delving",
  "Imbuing",
  "Exploring",
  "One-handed",
  "Two-handed",
  "Ranged",
  "Defense",
];

const origin = (catalog.origin || "https://ironwoodrpg.com").replace(/\/$/, "");

function formatCatalogActionLabel(action) {
  const group = action.group ? `${action.group} — ` : "";
  const outskirts =
    !action.group?.includes("Outskirts") && action.actionId >= 1000 ? "Outskirts — " : "";
  return `${outskirts}${group}${action.name} (Lv. ${action.level})`;
}

function actionUrl(action) {
  if (!action.path) return "";
  const p = action.path.startsWith("/") ? action.path : `/${action.path}`;
  return `${origin}${p}`;
}

function csvCell(value) {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const rows = [["Label", "URL"]];

for (const skill of SKILLS) {
  for (const action of catalog.skills[skill].actions) {
    rows.push([formatCatalogActionLabel(action), actionUrl(action)]);
  }
}

const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
const outPath = path.join(process.cwd(), "scripts", "action-dropdown-labels.csv");
fs.writeFileSync(outPath, csv, "utf8");
console.log(`Wrote ${rows.length - 1} actions to ${outPath}`);
