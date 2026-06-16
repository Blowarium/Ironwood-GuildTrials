export function rankLabel(rank: number | null): string {
  if (rank === 1) return "1st choice";
  if (rank === 2) return "2nd choice";
  if (rank === 3) return "3rd choice";
  if (rank != null) return `Pref rank ${rank}`;
  return "No pref match";
}

export function rankClass(rank: number | null): string {
  if (rank === 1) return "text-emerald-400";
  if (rank === 2) return "text-sky-300";
  if (rank === 3) return "text-slate-300";
  if (rank != null && rank <= 8) return "text-slate-400";
  return "text-amber-400/90";
}
