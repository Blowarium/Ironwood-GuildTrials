import { NextRequest, NextResponse } from "next/server";
import type { Member } from "@/lib/constants";
import { isDiscordConfigured } from "@/lib/discord-env";
import {
  postDiscordSuggestionsForWeek,
  resolveDiscordPostWeekStart,
} from "@/lib/discord-post";
import {
  assertStaffAuth,
  loadRolesMap,
  parseActor,
  parseStaffToken,
  requireActor,
} from "@/lib/server-auth";
import { getDb } from "@/lib/db";
import { devStore } from "@/lib/dev-store";
import { buildRolesMap } from "@/lib/roles";

export async function GET() {
  return NextResponse.json({
    configured: isDiscordConfigured(),
  });
}

export async function POST(request: NextRequest) {
  let body: {
    actorMember?: Member;
    staffAuthToken?: string;
    weekStart?: string;
    kind?: "weekly" | "reminder";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const actorResult = requireActor(parseActor(body.actorMember));
  if (!actorResult.ok) {
    return NextResponse.json({ error: actorResult.error }, { status: actorResult.status });
  }
  const actorMember = actorResult.actor;
  const staffToken = parseStaffToken(body.staffAuthToken);

  const db = getDb();
  const rolesMap = db
    ? await loadRolesMap(db)
    : buildRolesMap(devStore.listRoles(), devStore.listMemberNames());

  const staffCheck = assertStaffAuth(actorMember, rolesMap, staffToken);
  if (staffCheck !== true) {
    return NextResponse.json({ error: staffCheck.error }, { status: staffCheck.status });
  }

  const kind = body.kind === "reminder" ? "reminder" : "weekly";
  const weekStart = resolveDiscordPostWeekStart(body.weekStart ?? null);
  const result = await postDiscordSuggestionsForWeek(weekStart, kind);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
