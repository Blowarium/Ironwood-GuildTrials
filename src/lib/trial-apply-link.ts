import type { Member } from "./constants";
import { findWeekOffsetForStart } from "./weeks";

export const TRIAL_APPLY_WEEK_PARAM = "weekStart";
export const TRIAL_APPLY_MEMBER_PARAM = "member";

export type TrialApplyDeepLink = {
  weekStart: string;
  member: Member;
};

export function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  return "http://localhost:3000";
}

export function buildTrialApplyLink(weekStart: string, member: Member, baseUrl?: string): string {
  const origin = (baseUrl ?? getAppBaseUrl()).replace(/\/$/, "");
  const url = new URL(origin);
  url.searchParams.set(TRIAL_APPLY_WEEK_PARAM, weekStart);
  url.searchParams.set(TRIAL_APPLY_MEMBER_PARAM, member);
  return url.toString();
}

export function readTrialApplyDeepLink(search: string): TrialApplyDeepLink | null {
  const params = new URLSearchParams(search);
  const weekStart = params.get(TRIAL_APPLY_WEEK_PARAM)?.trim();
  const member = params.get(TRIAL_APPLY_MEMBER_PARAM)?.trim();
  if (!weekStart || !member) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return null;
  return { weekStart, member: member as Member };
}

export function clearTrialApplyParamsFromUrl(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(TRIAL_APPLY_WEEK_PARAM);
  url.searchParams.delete(TRIAL_APPLY_MEMBER_PARAM);
  return url.pathname + url.search + url.hash;
}

export { findWeekOffsetForStart };