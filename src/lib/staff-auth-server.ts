import { createHmac, timingSafeEqual } from "crypto";
import type { Member } from "./constants";
import type { GuildRole } from "./roles";
import { isStaffRole } from "./permissions";

/** ~1 year — remembered on this device until sign-out. */
export const STAFF_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export interface StaffTokenPayload {
  member: Member;
  role: GuildRole;
  exp: number;
}

function authSecret(): string {
  return (
    process.env.STAFF_AUTH_SECRET ||
    (process.env.NODE_ENV === "development" ? "dev-staff-auth-secret" : "")
  );
}

function passwordForRole(role: GuildRole): string | null {
  if (role === "guild_leader") {
    return (
      process.env.GUILD_LEADER_PASSWORD ||
      (process.env.NODE_ENV === "development" ? "dev-leader" : null)
    );
  }
  if (role === "guild_officer") {
    return (
      process.env.GUILD_OFFICER_PASSWORD ||
      (process.env.NODE_ENV === "development" ? "dev-officer" : null)
    );
  }
  return null;
}

function safeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function staffPasswordsConfigured(): boolean {
  return !!(passwordForRole("guild_leader") || passwordForRole("guild_officer"));
}

/** Verify password for a staff role. Leader password also works for officers. */
export function verifyStaffPassword(role: GuildRole, password: string): boolean {
  if (!isStaffRole(role)) return false;
  const expected = passwordForRole(role);
  if (expected && safeEqualString(password, expected)) return true;
  if (role === "guild_officer") {
    const leaderPw = passwordForRole("guild_leader");
    if (leaderPw && safeEqualString(password, leaderPw)) return true;
  }
  return false;
}

function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function createStaffToken(member: Member, role: GuildRole): string | null {
  const secret = authSecret();
  if (!secret || !isStaffRole(role)) return null;
  const payload: StaffTokenPayload = {
    member,
    role,
    exp: Date.now() + STAFF_TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signBody(body, secret)}`;
}

export function verifyStaffToken(token: string): StaffTokenPayload | null {
  const secret = authSecret();
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = signBody(body, secret);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as StaffTokenPayload;
    if (!payload.member || !payload.role || !payload.exp) return null;
    if (!isStaffRole(payload.role)) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
