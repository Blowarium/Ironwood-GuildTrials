import { NextRequest, NextResponse } from "next/server";
import type { DiscordSuggestionPostKind } from "@/lib/discord-suggestions";
import {
  isAuthorizedCronRequest,
  postDiscordSuggestionsForWeek,
  resolveDiscordPostWeekStart,
} from "@/lib/discord-post";
import { readDiscordConfig } from "@/lib/discord-env";

function parseKind(value: string | null): DiscordSuggestionPostKind {
  return value === "reminder" ? "reminder" : "weekly";
}

export async function GET(request: NextRequest) {
  const config = readDiscordConfig();
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), config?.cronSecret ?? null)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const kind = parseKind(request.nextUrl.searchParams.get("kind"));
  const weekStart = resolveDiscordPostWeekStart(request.nextUrl.searchParams.get("weekStart"));

  const result = await postDiscordSuggestionsForWeek(weekStart, kind);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  return GET(request);
}
