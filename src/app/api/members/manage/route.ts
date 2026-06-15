import { NextRequest, NextResponse } from "next/server";
import type { Member } from "@/lib/constants";
import { ensureSchema, getDb } from "@/lib/db";
import { devStore } from "@/lib/dev-store";
import {
  addGuildMember,
  assertActiveMember,
  removeGuildMember,
} from "@/lib/guild-members";
import { buildRolesMap } from "@/lib/roles";
import {
  assertLeader,
  loadRolesMap,
  parseActor,
  parseStaffToken,
  requireActor,
} from "@/lib/server-auth";

export async function POST(request: NextRequest) {
  let body: {
    actorMember?: Member;
    memberName?: string;
    action?: string;
    staffAuthToken?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const actor = parseActor(body.actorMember);
  const actorResult = requireActor(actor);
  if (!actorResult.ok) {
    return NextResponse.json({ error: actorResult.error }, { status: actorResult.status });
  }
  const actorMember = actorResult.actor;
  const staffToken = parseStaffToken(body.staffAuthToken);

  const db = getDb();
  const active = await assertActiveMember(db, actorMember);
  if (active !== true) {
    return NextResponse.json({ error: active.error }, { status: active.status });
  }

  if (!db) {
    const rolesMap = buildRolesMap(devStore.listRoles(), devStore.listMemberNames());
    const perm = assertLeader(actorMember, rolesMap, staffToken);
    if (perm !== true) {
      return NextResponse.json({ error: perm.error }, { status: perm.status });
    }
  } else {
    await ensureSchema();
    const rolesMap = await loadRolesMap(db);
    const perm = assertLeader(actorMember, rolesMap, staffToken);
    if (perm !== true) {
      return NextResponse.json({ error: perm.error }, { status: perm.status });
    }
  }

  if (body.action === "add") {
    if (!body.memberName) {
      return NextResponse.json({ error: "memberName is required." }, { status: 400 });
    }
    const result = await addGuildMember(db, body.memberName, actorMember);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ members: result.members, mode: db ? "database" : "dev" });
  }

  if (body.action === "remove") {
    if (!body.memberName) {
      return NextResponse.json({ error: "memberName is required." }, { status: 400 });
    }
    const result = await removeGuildMember(db, body.memberName as Member, actorMember);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ members: result.members, mode: db ? "database" : "dev" });
  }

  return NextResponse.json({ error: "action must be add or remove." }, { status: 400 });
}
