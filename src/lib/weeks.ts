const DAY_MS = 24 * 60 * 60 * 1000;

/** Monday 00:00 local time for the trial week containing `date`, plus `weekOffset` weeks. */
export function getWeekStart(date = new Date(), weekOffset = 0): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const mondayDelta = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + mondayDelta + weekOffset * 7);
  return toISODate(d);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function getWeekDays(weekStart: string): string[] {
  const start = parseISODate(weekStart);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return toISODate(d);
  });
}

export function formatWeekRange(weekStart: string): string {
  const days = getWeekDays(weekStart);
  const start = parseISODate(days[0]);
  const end = parseISODate(days[6]);
  const fmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

export function formatDayLabel(iso: string, short = false): string {
  const d = parseISODate(iso);
  return new Intl.DateTimeFormat(undefined, {
    weekday: short ? "short" : "long",
    month: "short",
    day: "numeric",
  }).format(d);
}

export function isDateInWeek(iso: string, weekStart: string): boolean {
  const days = getWeekDays(weekStart);
  return days.includes(iso);
}

export function weekLabel(weekOffset: number): string {
  if (weekOffset === 0) return "This week";
  if (weekOffset === 1) return "Next week";
  return `+${weekOffset} weeks`;
}

/** Tab label e.g. "Week of Jun 2" */
export function formatWeekTabLabel(weekStart: string): string {
  const d = parseISODate(weekStart);
  return `Week of ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d)}`;
}

/** Trial window copy for the UI */
export const TRIAL_WINDOW_NOTE =
  "Goal: complete all 16 skill trials each week. Mark a skill done when finished — until then, more members can sign up. One 24h trial per member per week.";
