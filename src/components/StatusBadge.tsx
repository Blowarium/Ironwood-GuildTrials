import { STATUS_LABELS, STATUS_STYLES, type TrialStatus } from "@/lib/constants";

export function StatusBadge({
  status,
  small,
}: {
  status: TrialStatus;
  small?: boolean;
}) {
  return (
    <span
      className={`inline-block rounded font-medium ${STATUS_STYLES[status]} ${
        small ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
      }`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
