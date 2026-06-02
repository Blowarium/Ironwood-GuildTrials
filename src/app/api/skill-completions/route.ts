import { NextRequest, NextResponse } from "next/server";
import { MEMBERS, SKILLS, type Member, type Skill } from "@/lib/constants";
import { ensureSchema, getDb } from "@/lib/db";
import { devStore } from "@/lib/dev-store";
import type { SkillCompletionPayload, SkillWeekCompletion } from "@/lib/types";

function isMember(name: string): name is Member {
  return (MEMBERS as readonly string[]).includes(name);
}

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
  if (body.markedBy && !isMember(body.markedBy)) {
    return NextResponse.json({ error: "Unknown guild member." }, { status: 400 });
  }

  const markedBy = body.markedBy ?? null;

  const db = getDb();
  if (!db) {
    const completion = devStore.setSkillCompletion(
      body.weekStart,
      body.skill,
      body.completed,
      markedBy,
    );
    return NextResponse.json({ completion, mode: "dev" as const });
  }

  await ensureSchema();

  if (!body.completed) {
    await db`
      DELETE FROM skill_week_completions
      WHERE week_start = ${body.weekStart}::date AND skill = ${body.skill}
    `;
    return NextResponse.json({ completion: null, mode: "database" as const });
  }

  const rows = (await db`
    INSERT INTO skill_week_completions (week_start, skill, completed, marked_by)
    VALUES (${body.weekStart}::date, ${body.skill}, TRUE, ${markedBy})
    ON CONFLICT (week_start, skill)
    DO UPDATE SET
      completed = TRUE,
      marked_by = EXCLUDED.marked_by,
      updated_at = NOW()
    RETURNING week_start::text, skill, completed, marked_by, updated_at::text
  `) as SkillWeekCompletion[];

  return NextResponse.json({ completion: rows[0], mode: "database" });
}
