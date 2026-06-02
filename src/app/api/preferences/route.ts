import { NextRequest, NextResponse } from "next/server";
import { MEMBERS, type Member, type Skill } from "@/lib/constants";
import { ensureSchema, getDb } from "@/lib/db";
import { devStore } from "@/lib/dev-store";
import { parseXp, validatePreferences, type MemberPreferences } from "@/lib/preferences";

function isMember(name: string): name is Member {
  return (MEMBERS as readonly string[]).includes(name);
}

export async function GET() {
  const db = getDb();
  if (!db) {
    return NextResponse.json({
      preferences: devStore.listPreferences(),
      mode: "dev" as const,
    });
  }

  await ensureSchema();
  const rows = (await db`
    SELECT member_name, pref_1, pref_2, pref_3,
           xp_pref_1, xp_pref_2, xp_pref_3, updated_at::text
    FROM member_preferences
    ORDER BY member_name
  `) as MemberPreferences[];

  return NextResponse.json({ preferences: rows, mode: "database" as const });
}

export async function PUT(request: NextRequest) {
  let body: {
    memberName: Member;
    pref1: Skill | null;
    pref2: Skill | null;
    pref3: Skill | null;
    xp1?: unknown;
    xp2?: unknown;
    xp3?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.memberName || !isMember(body.memberName)) {
    return NextResponse.json({ error: "Unknown guild member." }, { status: 400 });
  }

  const p1 = body.pref1 ?? "";
  const p2 = body.pref2 ?? "";
  const p3 = body.pref3 ?? "";
  const err = validatePreferences(p1, p2, p3, body.xp1, body.xp2, body.xp3);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const pref1 = p1 || null;
  const pref2 = p2 || null;
  const pref3 = p3 || null;
  const xp1 = parseXp(body.xp1);
  const xp2 = parseXp(body.xp2);
  const xp3 = parseXp(body.xp3);

  const db = getDb();
  if (!db) {
    const preferences = devStore.setPreferences(
      body.memberName,
      pref1,
      pref2,
      pref3,
      xp1,
      xp2,
      xp3,
    );
    return NextResponse.json({ preferences, mode: "dev" });
  }

  await ensureSchema();
  const rows = (await db`
    INSERT INTO member_preferences (member_name, pref_1, pref_2, pref_3, xp_pref_1, xp_pref_2, xp_pref_3)
    VALUES (${body.memberName}, ${pref1}, ${pref2}, ${pref3}, ${xp1}, ${xp2}, ${xp3})
    ON CONFLICT (member_name)
    DO UPDATE SET
      pref_1 = EXCLUDED.pref_1,
      pref_2 = EXCLUDED.pref_2,
      pref_3 = EXCLUDED.pref_3,
      xp_pref_1 = EXCLUDED.xp_pref_1,
      xp_pref_2 = EXCLUDED.xp_pref_2,
      xp_pref_3 = EXCLUDED.xp_pref_3,
      updated_at = NOW()
    RETURNING member_name, pref_1, pref_2, pref_3,
              xp_pref_1, xp_pref_2, xp_pref_3, updated_at::text
  `) as MemberPreferences[];

  return NextResponse.json({ preferences: rows[0], mode: "database" });
}
