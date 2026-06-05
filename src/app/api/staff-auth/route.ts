import { NextRequest, NextResponse } from "next/server";
import { MEMBERS, type Member } from "@/lib/constants";
import { ensureSchema, getDb } from "@/lib/db";
import { devStore } from "@/lib/dev-store";
import { isStaffRole } from "@/lib/permissions";
import { loadRolesMap, parseActor, requireActor } from "@/lib/server-auth";
import {
  createStaffToken,
  staffPasswordsConfigured,
  STAFF_TOKEN_TTL_MS,
  verifyStaffPassword,
  verifyStaffToken,
} from "@/lib/staff-auth-server";
import { buildRolesMap, getMemberRole } from "@/lib/roles";

function isMember(name: string): name is Member {
  return (MEMBERS as readonly string[]).includes(name);
}

async function roleForMember(member: Member): Promise<import("@/lib/roles").GuildRole> {
  const db = getDb();
  if (!db) return devStore.getRole(member);
  await ensureSchema();
  const rolesMap = await loadRolesMap(db);
  return getMemberRole(rolesMap, member)!;
}

export async function GET(request: NextRequest) {
  const memberParam = request.nextUrl.searchParams.get("member");
  const tokenParam = request.nextUrl.searchParams.get("token");

  if (!memberParam || !isMember(memberParam) || !tokenParam) {
    return NextResponse.json({ valid: false }, { status: 400 });
  }

  const payload = verifyStaffToken(tokenParam);
  const valid =
    !!payload &&
    payload.member === memberParam &&
    payload.role === (await roleForMember(memberParam));

  return NextResponse.json({
    valid,
    expiresAt: valid ? new Date(payload!.exp).toISOString() : null,
  });
}

export async function POST(request: NextRequest) {
  if (!staffPasswordsConfigured()) {
    return NextResponse.json(
      { error: "Staff passwords are not configured on the server." },
      { status: 503 },
    );
  }

  let body: { memberName?: Member; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.memberName || !isMember(body.memberName)) {
    return NextResponse.json({ error: "Unknown guild member." }, { status: 400 });
  }
  if (!body.password || typeof body.password !== "string") {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }

  const role = await roleForMember(body.memberName);
  if (!isStaffRole(role)) {
    return NextResponse.json(
      { error: "This character does not have staff permissions." },
      { status: 403 },
    );
  }

  if (!verifyStaffPassword(role, body.password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const token = createStaffToken(body.memberName, role);
  if (!token) {
    return NextResponse.json({ error: "Could not create staff session." }, { status: 500 });
  }

  return NextResponse.json({
    token,
    member: body.memberName,
    role,
    expiresAt: new Date(Date.now() + STAFF_TOKEN_TTL_MS).toISOString(),
  });
}

export async function DELETE(request: NextRequest) {
  const actor = parseActor(request.nextUrl.searchParams.get("member"));
  const actorResult = requireActor(actor);
  if (!actorResult.ok) {
    return NextResponse.json({ error: actorResult.error }, { status: actorResult.status });
  }
  return NextResponse.json({ ok: true });
}
