import type { Member } from "@/lib/constants";

export function MemberPicker({
  value,
  onChange,
  members,
}: {
  value: Member | "";
  onChange: (m: Member | "") => void;
  members: Member[];
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-300">Who are you?</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Member | "")}
        className="mt-1.5 w-full max-w-xs rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-white shadow-inner"
      >
        <option value="">Select your name…</option>
        {members.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-500">Saved in this browser — no login needed.</p>
    </label>
  );
}
