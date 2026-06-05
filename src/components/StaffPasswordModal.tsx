"use client";

import { useState } from "react";
import { ROLE_LABELS, type GuildRole } from "@/lib/roles";
import type { Member } from "@/lib/constants";
import { RoleBadge } from "./ProfileHeaderBar";

export function StaffPasswordModal({
  open,
  member,
  role,
  onUnlock,
  onContinueWithoutStaff,
  onCancel,
}: {
  open: boolean;
  member: Member;
  role: GuildRole;
  onUnlock: (password: string) => Promise<string | null>;
  onContinueWithoutStaff: () => void;
  onCancel?: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const err = await onUnlock(password);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    setPassword("");
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4">
      <div
        className="w-full max-w-md rounded-xl border border-amber-500/30 bg-[#131f36] p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-auth-title"
      >
        <h2 id="staff-auth-title" className="text-lg font-bold text-white">
          Staff verification
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          <span className="font-medium text-white">{member}</span> is a{" "}
          <RoleBadge role={role} /> — enter the {ROLE_LABELS[role].toLowerCase()} password to
          unlock staff tools on this device.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Your browser will remember this until you sign out of staff or clear site data.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs text-slate-400">Password</span>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
              placeholder={`${ROLE_LABELS[role]} password`}
            />
          </label>
          {error && (
            <p className="rounded-lg bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-lg bg-amber-600 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
          >
            {loading ? "Verifying…" : "Unlock staff tools"}
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setPassword("");
              setError(null);
              onContinueWithoutStaff();
            }}
            className="flex-1 rounded-lg border border-slate-600 py-2 text-sm text-slate-300 hover:bg-slate-800/60"
          >
            Continue without staff access
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-500"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
