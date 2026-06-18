import { NextRequest, NextResponse } from "next/server";
import { SKILLS, type Member, type Skill } from "@/lib/constants";
import { ensureSchema, getDb } from "@/lib/db";
import { devStore } from "@/lib/dev-store";
import { assertActiveMember } from "@/lib/guild-members";
import { buildRolesMap } from "@/lib/roles";
import {
  assertStaffAuth,
  loadRolesMap,
  parseActor,
  parseStaffToken,
  requireActor,
} from "@/lib/server-auth";
import type { SkillCompletionPayload, SkillWeekCompletion } from "@/lib/types";

function isSkill(name: string): name is Skill {
  return (SKILLS as readonly string[]).includes(name);
}

export async function PUT(request: NextRequest) {
  let body: SkillCompletionPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.weekStart || !body.skill || typeof body.completed !== "boolean") {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (!isSkill(body.skill)) {
    return NextResponse.json({ error: "Unknown skill." }, { status: 400 });
  }

  const actor = parseActor(body.markedBy);
  const actorResult = requireActor(actor);
  if (!actorResult.ok) {
    return NextResponse.json({ error: actorResult.error }, { status: actorResult.status });
  }
  const actorMember = actorResult.actor;
  const staffToken = parseStaffToken(body.staffAuthToken);

  const db = getDb();
  const memberCheck = await assertActiveMember(db, actorMember);
  if (memberCheck !== true) {
    return NextResponse.json({ error: memberCheck.error }, { status: memberCheck.status });
  }

  if (!db) {
    const rolesMap = buildRolesMap(devStore.listRoles(), devStore.listMemberNames());
    const perm = assertStaffAuth(actorMember, rolesMap, staffToken);
    if (perm !== true) {
      return NextResponse.json({ error: perm.error }, { status: perm.status });
    }

    const completion = devStore.setSkillCompletion(
      body.weekStart,
      body.skill,
      body.completed,
      actorMember,
    );
    return NextResponse.json({ completion, mode: "dev" as const });
  }

  await ensureSchema();
  const rolesMap = await loadRolesMap(db);
  const perm = assertStaffAuth(actorMember, rolesMap, staffToken);
  if (perm !== true) {
    return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

  if (!body.completed) {
    await db`
      DELETE FROM skill_week_completions
      WHERE week_start = ${body.weekStart}::date AND skill = ${body.skill}
    `;
    return NextResponse.json({ completion: null, mode: "database" as const });
  }

  const rows = (await db`
    INSERT INTO skill_week_completions (week_start, skill, completed, marked_by)
    VALUES (${body.weekStart}::date, ${body.skill}, TRUE, ${actorMember})
    ON CONFLICT (week_start, skill)
    DO UPDATE SET
      completed = TRUE,
      marked_by = EXCLUDED.marked_by,
      updated_at = NOW()
    RETURNING week_start::text, skill, completed, marked_by, updated_at::text
  `) as SkillWeekCompletion[];

  return NextResponse.json({ completion: rows[0], mode: "database" });
}
