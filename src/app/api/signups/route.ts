import { NextRequest, NextResponse } from "next/server";
import {
  MEMBERS,
  SKILLS,
  TRIAL_STATUSES,
  type Member,
  type Skill,
  type TrialStatus,
} from "@/lib/constants";
import { ensureSchema, getDb } from "@/lib/db";
import { devStore } from "@/lib/dev-store";
import type {
  PatchSignupPayload,
  SignupPayload,
  SkillWeekCompletion,
  TrialSignup,
} from "@/lib/types";
import { isDateInWeek } from "@/lib/weeks";

function isMember(name: string): name is Member {
  return (MEMBERS as readonly string[]).includes(name);
}

function isSkill(name: string): name is Skill {
  return (SKILLS as readonly string[]).includes(name);
}

function isStatus(name: string): name is TrialStatus {
  return (TRIAL_STATUSES as readonly string[]).includes(name);
}

function validatePayload(body: SignupPayload): string | null {
  if (!body.weekStart || !body.memberName || !body.skill || !body.plannedDate) {
    return "Missing required fields.";
  }
  if (!isMember(body.memberName)) return "Unknown guild member.";
  if (!isSkill(body.skill)) return "Unknown skill.";
  if (body.status && !isStatus(body.status)) return "Invalid status.";
  if (!isDateInWeek(body.plannedDate, body.weekStart)) {
    return "Planned day must be within the selected trial week.";
  }
  return null;
}

export async function GET(request: NextRequest) {
  const weekStart = request.nextUrl.searchParams.get("weekStart");
  if (!weekStart) {
    return NextResponse.json({ error: "weekStart is required." }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({
      signups: devStore.list(weekStart),
      completions: devStore.listCompletions(weekStart),
      mode: "dev" as const,
    });
  }

  await ensureSchema();
  const rows = (await db`
    SELECT id, week_start::text, member_name, skill, planned_date::text,
           status, created_at::text, updated_at::text
    FROM trial_signups
    WHERE week_start = ${weekStart}::date
    ORDER BY skill, planned_date, member_name
  `) as TrialSignup[];

  const completionRows = (await db`
    SELECT week_start::text, skill, completed, marked_by, updated_at::text
    FROM skill_week_completions
    WHERE week_start = ${weekStart}::date AND completed = TRUE
  `) as SkillWeekCompletion[];

  return NextResponse.json({
    signups: rows,
    completions: completionRows,
    mode: "database" as const,
  });
}

export async function POST(request: NextRequest) {
  let body: SignupPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const error = validatePayload(body);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const status: TrialStatus = body.status && isStatus(body.status) ? body.status : "planned";

  const db = getDb();
  if (!db) {
    const existing = devStore.findMemberSignup(body.weekStart, body.memberName);
    if (
      existing &&
      existing.skill === body.skill &&
      existing.planned_date === body.plannedDate
    ) {
      const signup = devStore.upsert({
        week_start: body.weekStart,
        member_name: body.memberName,
        skill: body.skill,
        planned_date: body.plannedDate,
        status,
      });
      return NextResponse.json({ signup, mode: "dev" });
    }

    if (
      existing &&
      (existing.skill !== body.skill || existing.planned_date !== body.plannedDate)
    ) {
      const signup = devStore.upsert({
        week_start: body.weekStart,
        member_name: body.memberName,
        skill: body.skill,
        planned_date: body.plannedDate,
        status,
      });
      return NextResponse.json({ signup, mode: "dev", moved: true });
    }

    const signup = devStore.upsert({
      week_start: body.weekStart,
      member_name: body.memberName,
      skill: body.skill,
      planned_date: body.plannedDate,
      status,
    });
    return NextResponse.json({ signup, mode: "dev" });
  }

  await ensureSchema();

  const rows = (await db`
    INSERT INTO trial_signups (week_start, member_name, skill, planned_date, status)
    VALUES (${body.weekStart}::date, ${body.memberName}, ${body.skill}, ${body.plannedDate}::date, ${status})
    ON CONFLICT (week_start, member_name)
    DO UPDATE SET
      skill = EXCLUDED.skill,
      planned_date = EXCLUDED.planned_date,
      status = EXCLUDED.status,
      updated_at = NOW()
    RETURNING id, week_start::text, member_name, skill, planned_date::text,
              status, created_at::text, updated_at::text
  `) as TrialSignup[];

  return NextResponse.json({ signup: rows[0], mode: "database" });
}

export async function PATCH(request: NextRequest) {
  let body: PatchSignupPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.id || !body.memberName || !body.status) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (!isMember(body.memberName)) {
    return NextResponse.json({ error: "Unknown guild member." }, { status: 400 });
  }
  if (!isStatus(body.status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    const signup = devStore.patchStatus(body.id, body.memberName, body.status);
    if (!signup) {
      return NextResponse.json({ error: "Signup not found." }, { status: 404 });
    }
    return NextResponse.json({ signup, mode: "dev" });
  }

  await ensureSchema();
  const rows = (await db`
    UPDATE trial_signups
    SET status = ${body.status}, updated_at = NOW()
    WHERE id = ${body.id} AND member_name = ${body.memberName}
    RETURNING id, week_start::text, member_name, skill, planned_date::text,
              status, created_at::text, updated_at::text
  `) as TrialSignup[];

  if (rows.length === 0) {
    return NextResponse.json({ error: "Signup not found." }, { status: 404 });
  }

  return NextResponse.json({ signup: rows[0], mode: "database" });
}

export async function DELETE(request: NextRequest) {
  const idParam = request.nextUrl.searchParams.get("id");
  const memberName = request.nextUrl.searchParams.get("memberName");

  const id = idParam ? Number(idParam) : NaN;
  if (!idParam || Number.isNaN(id) || !memberName || !isMember(memberName)) {
    return NextResponse.json({ error: "id and memberName are required." }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    if (!devStore.removeById(id, memberName)) {
      return NextResponse.json({ error: "Signup not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, mode: "dev" });
  }

  await ensureSchema();
  const deleted = await db`
    DELETE FROM trial_signups
    WHERE id = ${id} AND member_name = ${memberName}
    RETURNING id
  `;

  if (deleted.length === 0) {
    return NextResponse.json({ error: "Signup not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, mode: "database" });
}
