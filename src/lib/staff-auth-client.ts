import type { Member } from "./constants";
import type { GuildRole } from "./roles";
import { isStaffRole } from "./permissions";

export const STAFF_AUTH_STORAGE_KEY = "ironwood-trials-staff-auth";

export interface StaffAuthEntry {
  member: Member;
  role: GuildRole;
  token: string;
  expiresAt: string;
}

function readEntries(): StaffAuthEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STAFF_AUTH_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StaffAuthEntry[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(
      (e) =>
        e.member &&
        e.token &&
        e.expiresAt &&
        isStaffRole(e.role) &&
        new Date(e.expiresAt).getTime() > now,
    );
  } catch {
    return [];
  }
}

function writeEntries(entries: StaffAuthEntry[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STAFF_AUTH_STORAGE_KEY, JSON.stringify(entries));
}

export function getStaffAuthToken(member: Member): string | undefined {
  return readEntries().find((e) => e.member === member)?.token;
}

export function hasLocalStaffAuth(member: Member, role: GuildRole | null): boolean {
  if (!member || !role || !isStaffRole(role)) return false;
  return readEntries().some((e) => e.member === member && e.role === role);
}

export function storeStaffAuth(entry: StaffAuthEntry): void {
  const rest = readEntries().filter((e) => e.member !== entry.member);
  writeEntries([...rest, entry]);
}

export function removeStaffAuth(member: Member): void {
  writeEntries(readEntries().filter((e) => e.member !== member));
}

export function clearAllStaffAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STAFF_AUTH_STORAGE_KEY);
}
