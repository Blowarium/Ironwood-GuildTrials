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
import {
  assertSignupEdit,
  loadRolesMap,
  parseActor,
  parseStaffToken,
  requireActor,
} from "@/lib/server-auth";
import { buildRolesMap } from "@/lib/roles";
import {
  dateFromStartAt,
  getEffectiveStatus,
  normalizeSignupTiming,
  syncSignups,
} from "@/lib/trial-schedule";
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

function normalizeRow(row: TrialSignup): TrialSignup {
  const timing = normalizeSignupTiming(row);
  return {
    ...row,
    ...timing,
    last_edited_by: row.last_edited_by ?? null,
  };
}

function isStatus(name: string): name is TrialStatus {
  return (TRIAL_STATUSES as readonly string[]).includes(name);
}

async function persistStatusSync(db: NonNullable<ReturnType<typeof getDb>>, rows: TrialSignup[]) {
  const now = new Date();
  for (const row of rows) {
    const normalized = normalizeRow(row);
    const effective = getEffectiveStatus(normalized, now);
    if (effective !== row.status) {
      await db`
        UPDATE trial_signups SET status = ${effective}, updated_at = NOW()
        WHERE id = ${row.id}
      `;
    }
  }
}

function validatePayload(body: SignupPayload): string | null {
  if (!body.weekStart || !body.memberName || !body.skill || !body.plannedDate) {
    return "Missing required fields.";
  }
  if (!isMember(body.memberName)) return "Unknown guild member.";
  if (!isSkill(body.skill)) return "Unknown skill.";
  if (!isDateInWeek(body.plannedDate, body.weekStart)) {
    return "Planned day must be within the selected trial week.";
  }
  if (body.plannedStartAt) {
    const startDate = dateFromStartAt(body.plannedStartAt);
    if (!isDateInWeek(startDate, body.weekStart)) {
      return "Start time must fall within the selected trial week.";
    }
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
    const synced = syncSignups(devStore.list(weekStart).map(normalizeRow));
    for (const s of synced) devStore.upsert(s);
    return NextResponse.json({
      signups: synced,
      completions: devStore.listCompletions(weekStart),
      mode: "dev" as const,
    });
  }

  await ensureSchema();
  const rows = (await db`
    SELECT id, week_start::text, member_name, skill, planned_date::text,
           planned_start_at::text, status, last_edited_by,
           created_at::text, updated_at::text
    FROM trial_signups
    WHERE week_start = ${weekStart}::date
    ORDER BY skill, planned_start_at, member_name
  `) as TrialSignup[];

  const normalized = rows.map(normalizeRow);
  const synced = syncSignups(normalized);
  await persistStatusSync(db, rows);

  const completionRows = (await db`
    SELECT week_start::text, skill, completed, marked_by, updated_at::text
    FROM skill_week_completions
    WHERE week_start = ${weekStart}::date AND completed = TRUE
  `) as SkillWeekCompletion[];

  return NextResponse.json({
    signups: synced,
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

  const actor = parseActor(body.actorMember);
  const actorResult = requireActor(actor);
  if (!actorResult.ok) {
    return NextResponse.json({ error: actorResult.error }, { status: actorResult.status });
  }
  const actorMember = actorResult.actor;
  const staffToken = parseStaffToken(body.staffAuthToken);

  const timing = normalizeSignupTiming({
    planned_date: body.plannedDate,
    planned_start_at: body.plannedStartAt,
  });
  const status: TrialStatus = getEffectiveStatus({
    id: 0,
    week_start: body.weekStart,
    member_name: body.memberName,
    skill: body.skill,
    planned_date: timing.planned_date,
    planned_start_at: timing.planned_start_at,
    status: "planned",
    last_edited_by: actorMember,
    created_at: "",
    updated_at: "",
  });

  const db = getDb();
  if (!db) {
    const rolesMap = buildRolesMap(devStore.listRoles());
    const perm = assertSignupEdit(actorMember, body.memberName, rolesMap, staffToken);
    if (perm !== true) {
      return NextResponse.json({ error: perm.error }, { status: perm.status });
    }

    const signup = devStore.upsert({
      week_start: body.weekStart,
      member_name: body.memberName,
      skill: body.skill,
      planned_date: timing.planned_date,
      planned_start_at: timing.planned_start_at,
      status,
      last_edited_by: actorMember,
    });
    return NextResponse.json({ signup: normalizeRow(signup), mode: "dev" });
  }

  await ensureSchema();
  const rolesMap = await loadRolesMap(db);
  const perm = assertSignupEdit(actorMember, body.memberName, rolesMap, staffToken);
  if (perm !== true) {
    return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

  const rows = (await db`
    INSERT INTO trial_signups (
      week_start, member_name, skill, planned_date, planned_start_at, status, last_edited_by
    )
    VALUES (
      ${body.weekStart}::date, ${body.memberName}, ${body.skill},
      ${timing.planned_date}::date, ${timing.planned_start_at}::timestamptz,
      ${status}, ${actorMember}
    )
    ON CONFLICT (week_start, member_name)
    DO UPDATE SET
      skill = EXCLUDED.skill,
      planned_date = EXCLUDED.planned_date,
      planned_start_at = EXCLUDED.planned_start_at,
      status = EXCLUDED.status,
      last_edited_by = EXCLUDED.last_edited_by,
      updated_at = NOW()
    RETURNING id, week_start::text, member_name, skill, planned_date::text,
              planned_start_at::text, status, last_edited_by,
              created_at::text, updated_at::text
  `) as TrialSignup[];

  return NextResponse.json({ signup: normalizeRow(rows[0]), mode: "database" });
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

  const actor = parseActor(body.actorMember);
  const actorResult = requireActor(actor);
  if (!actorResult.ok) {
    return NextResponse.json({ error: actorResult.error }, { status: actorResult.status });
  }
  const actorMember = actorResult.actor;
  const staffToken = parseStaffToken(body.staffAuthToken);

  const db = getDb();
  if (!db) {
    const rolesMap = buildRolesMap(devStore.listRoles());
    const perm = assertSignupEdit(actorMember, body.memberName, rolesMap, staffToken);
    if (perm !== true) {
      return NextResponse.json({ error: perm.error }, { status: perm.status });
    }

    const signup = devStore.patchStatus(body.id, body.memberName, body.status, actorMember);
    if (!signup) {
      return NextResponse.json({ error: "Signup not found." }, { status: 404 });
    }
    return NextResponse.json({ signup, mode: "dev" });
  }

  await ensureSchema();
  const rolesMap = await loadRolesMap(db);
  const perm = assertSignupEdit(actorMember, body.memberName, rolesMap, staffToken);
  if (perm !== true) {
    return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

  const rows = (await db`
    UPDATE trial_signups
    SET status = ${body.status}, last_edited_by = ${actorMember}, updated_at = NOW()
    WHERE id = ${body.id} AND member_name = ${body.memberName}
    RETURNING id, week_start::text, member_name, skill, planned_date::text,
              planned_start_at::text, status, last_edited_by,
              created_at::text, updated_at::text
  `) as TrialSignup[];

  if (rows.length === 0) {
    return NextResponse.json({ error: "Signup not found." }, { status: 404 });
  }

  return NextResponse.json({ signup: normalizeRow(rows[0]), mode: "database" });
}

export async function DELETE(request: NextRequest) {
  const idParam = request.nextUrl.searchParams.get("id");
  const memberName = request.nextUrl.searchParams.get("memberName");
  const actorParam = request.nextUrl.searchParams.get("actorMember");
  const staffToken = parseStaffToken(request.nextUrl.searchParams.get("staffAuthToken"));

  const id = idParam ? Number(idParam) : NaN;
  if (!idParam || Number.isNaN(id) || !memberName || !isMember(memberName)) {
    return NextResponse.json({ error: "id and memberName are required." }, { status: 400 });
  }

  const actor = parseActor(actorParam);
  const actorResult = requireActor(actor);
  if (!actorResult.ok) {
    return NextResponse.json({ error: actorResult.error }, { status: actorResult.status });
  }
  const actorMember = actorResult.actor;

  const db = getDb();
  if (!db) {
    const rolesMap = buildRolesMap(devStore.listRoles());
    const perm = assertSignupEdit(actorMember, memberName, rolesMap, staffToken);
    if (perm !== true) {
      return NextResponse.json({ error: perm.error }, { status: perm.status });
    }

    if (!devStore.removeById(id, memberName)) {
      return NextResponse.json({ error: "Signup not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, mode: "dev" });
  }

  await ensureSchema();
  const rolesMap = await loadRolesMap(db);
  const perm = assertSignupEdit(actorMember, memberName, rolesMap, staffToken);
  if (perm !== true) {
    return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

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
