import type { Member, Skill, TrialStatus } from "./constants";

export interface TrialSignup {
  id: number;
  week_start: string;
  member_name: Member;
  skill: Skill;
  planned_date: string;
  status: TrialStatus;
  created_at: string;
  updated_at: string;
}

export interface SignupPayload {
  weekStart: string;
  memberName: Member;
  skill: Skill;
  plannedDate: string;
  status?: TrialStatus;
}

export interface PatchSignupPayload {
  id: number;
  memberName: Member;
  status: TrialStatus;
}

export interface SkillWeekCompletion {
  week_start: string;
  skill: Skill;
  completed: boolean;
  marked_by: Member | null;
  updated_at: string;
}

export interface SkillCompletionPayload {
  weekStart: string;
  skill: Skill;
  completed: boolean;
  markedBy?: Member;
}
