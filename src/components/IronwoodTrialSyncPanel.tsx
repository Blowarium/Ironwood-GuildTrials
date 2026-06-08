"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TAMPERMONKEY_HOME_URL,
} from "@/lib/ironwood-xp-import";
import {
  buildIronwoodTrialSyncConsoleSnippet,
  buildIronwoodTrialSyncLaunchUrl,
  buildStaticIronwoodTrialSyncBookmarklet,
  buildUserscriptTrialSyncInstallUrl,
  isTrialSyncHelperInstalled,
} from "@/lib/ironwood-trial-sync";

export function IronwoodTrialSyncPanel({ returnUrl }: { returnUrl: string }) {
  const [helperReady, setHelperReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bookmarkletCopied, setBookmarkletCopied] = useState(false);

  const appOrigin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  useEffect(() => {
    setHelperReady(isTrialSyncHelperInstalled());
  }, []);

  const userscriptInstallUrl = useMemo(
    () => (appOrigin ? buildUserscriptTrialSyncInstallUrl(appOrigin) : ""),
    [appOrigin],
  );

  const consoleSnippet = useMemo(
    () => (appOrigin && returnUrl ? buildIronwoodTrialSyncConsoleSnippet(appOrigin, returnUrl) : ""),
    [appOrigin, returnUrl],
  );

  const staticBookmarklet = useMemo(() => buildStaticIronwoodTrialSyncBookmarklet(), []);

  const launchSync = useCallback(() => {
    if (!returnUrl) return;
    setSyncing(true);
    window.open(buildIronwoodTrialSyncLaunchUrl(returnUrl), "_blank", "noopener,noreferrer");
    window.setTimeout(() => setSyncing(false), 3000);
  }, [returnUrl]);

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(consoleSnippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* ignore */
    }
  }

  async function copyBookmarklet() {
    try {
      await navigator.clipboard.writeText(staticBookmarklet);
      setBookmarkletCopied(true);
      window.setTimeout(() => setBookmarkletCopied(false), 2500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-lg border border-violet-500/25 bg-violet-950/20 p-3 text-sm text-slate-300">
      <p className="font-medium text-violet-100">Sync from Ironwood</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        Opens ironwoodrpg.com/guild, selects the Trials tab, and adds or updates planner signups for
        active in-game assignments. Officers only.
      </p>

      {!helperReady ? (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            One-time setup
          </p>
          <ol className="list-decimal space-y-2 pl-4 text-xs text-slate-400">
            <li>
              Install{" "}
              <a
                href={TAMPERMONKEY_HOME_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 hover:underline"
              >
                Tampermonkey
              </a>{" "}
              (same as XP import).
            </li>
            <li>
              Install the trial sync helper — Tampermonkey should show its install dialog.
            </li>
          </ol>
          <a
            href={userscriptInstallUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 aria-disabled:pointer-events-none aria-disabled:opacity-50"
            aria-disabled={!userscriptInstallUrl}
          >
            Add trial sync helper
          </a>
        </div>
      ) : (
        <p className="mt-2 text-xs text-emerald-400/90">Trial sync helper installed.</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={launchSync}
          disabled={!returnUrl || syncing}
          className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {syncing ? "Opening Ironwood…" : "Sync from Ironwood now"}
        </button>
        {helperReady && (
          <a
            href={userscriptInstallUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-400 hover:border-slate-500"
          >
            Reinstall helper
          </a>
        )}
      </div>

      <details className="mt-3 text-xs text-slate-500">
        <summary className="cursor-pointer text-slate-400 hover:text-slate-300">
          Manual fallback
        </summary>
        <p className="mt-2 leading-relaxed">
          Open ironwoodrpg.com on Guild → Trials, press F12 → Console, paste the snippet.
        </p>
        <button
          type="button"
          onClick={copySnippet}
          className="mt-2 rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:border-slate-500"
        >
          {copied ? "Copied!" : "Copy console snippet"}
        </button>
        <p className="mt-3 leading-relaxed">
          Or copy a bookmark, then run it on the Ironwood tab opened by Sync above.
        </p>
        <button
          type="button"
          onClick={copyBookmarklet}
          className="mt-2 rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:border-slate-500"
        >
          {bookmarkletCopied ? "Bookmark copied!" : "Copy bookmark link"}
        </button>
      </details>
    </div>
  );
}
