"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FIREFOX_ANDROID_TAMPERMONKEY_URL,
  TAMPERMONKEY_HOME_URL,
  USERSCRIPTS_IOS_APP_URL,
} from "@/lib/ironwood-xp-import";
import {
  buildIronwoodTrialSyncConsoleSnippet,
  buildIronwoodTrialSyncHelperProbeUrl,
  buildIronwoodTrialSyncLaunchUrl,
  buildStaticIronwoodTrialSyncBookmarklet,
  buildUserscriptTrialSyncInstallUrl,
  isIronwoodOrigin,
  isIronwoodTrialSyncHelperMessage,
  isTrialSyncHelperInstalled,
  markTrialSyncHelperInstalled,
} from "@/lib/ironwood-trial-sync";

function markHelperReady(
  setLocal: (ready: boolean) => void,
  onParent?: (ready: boolean) => void,
) {
  markTrialSyncHelperInstalled();
  setLocal(true);
  onParent?.(true);
}

export function IronwoodTrialSyncPanel({
  returnUrl,
  helperReady: helperReadyProp,
  onHelperReadyChange,
}: {
  returnUrl: string;
  helperReady?: boolean;
  onHelperReadyChange?: (ready: boolean) => void;
}) {
  const [helperReadyLocal, setHelperReadyLocal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bookmarkletCopied, setBookmarkletCopied] = useState(false);

  const helperReady = helperReadyProp ?? helperReadyLocal;

  const appOrigin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  const probeHelper = useCallback(() => {
    if (isTrialSyncHelperInstalled()) {
      markHelperReady(setHelperReadyLocal, onHelperReadyChange);
      return;
    }
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = buildIronwoodTrialSyncHelperProbeUrl();
    document.body.appendChild(iframe);
    window.setTimeout(() => iframe.remove(), 8000);
  }, [onHelperReadyChange]);

  useEffect(() => {
    if (isTrialSyncHelperInstalled()) {
      setHelperReadyLocal(true);
      onHelperReadyChange?.(true);
      return;
    }
    probeHelper();
  }, [onHelperReadyChange, probeHelper]);

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
    window.open(buildIronwoodTrialSyncLaunchUrl(returnUrl), "_blank");
    window.setTimeout(() => setSyncing(false), 3000);
  }, [returnUrl]);

  function handleInstallClick() {
    window.setTimeout(probeHelper, 2500);
  }

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
        active in-game assignments. Enable the sync helper below first (same idea as XP/h import).
      </p>

      {!helperReady ? (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            One-time setup (~30 seconds)
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
              for your browser (Chrome, Edge, or Firefox).
            </li>
            <li>
              Click below — Tampermonkey should pop up its install dialog. Click{" "}
              <strong className="text-slate-300">Install</strong> there.
            </li>
          </ol>
          <a
            href={userscriptInstallUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleInstallClick}
            className="inline-block rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 aria-disabled:pointer-events-none aria-disabled:opacity-50"
            aria-disabled={!userscriptInstallUrl}
          >
            Add trial sync helper to Tampermonkey
          </a>
          <p className="text-[11px] text-slate-500">
            If you only see a page of code, Tampermonkey is not installed or not enabled on this
            site.
          </p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-emerald-400/90">
          Trial sync helper installed — use the button below whenever you want to sync from
          Ironwood.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={launchSync}
          disabled={!returnUrl || syncing}
          className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {syncing ? "Opening Ironwood…" : "Sync from Ironwood now"}
        </button>
        {helperReady && (
          <a
            href={userscriptInstallUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleInstallClick}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-400 hover:border-slate-500"
          >
            Reinstall helper
          </a>
        )}
      </div>

      <details className="mt-3 text-xs text-slate-500">
        <summary className="cursor-pointer text-slate-400 hover:text-slate-300">
          Phone or tablet
        </summary>
        <div className="mt-3 max-w-full space-y-3 leading-relaxed text-slate-400">
          <p>
            Use the same <strong className="text-slate-300">Sync from Ironwood now</strong> button
            after setup. Keep Guild Trials and Ironwood in the{" "}
            <strong className="text-slate-300">same browser</strong>.
          </p>
          <p>
            Android:{" "}
            <a
              href={FIREFOX_ANDROID_TAMPERMONKEY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 hover:underline"
            >
              Tampermonkey in Firefox for Android
            </a>
            , then install the helper above.
          </p>
          <p>
            iPhone / iPad: free{" "}
            <a
              href={USERSCRIPTS_IOS_APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 hover:underline"
            >
              Userscripts
            </a>{" "}
            app in Safari (same flow as XP/h import).
          </p>
        </div>
      </details>

      <details className="mt-3 text-xs text-slate-500">
        <summary className="cursor-pointer text-slate-400 hover:text-slate-300">
          Manual fallback (no Tampermonkey)
        </summary>
        <p className="mt-2 leading-relaxed">
          Open ironwoodrpg.com/guild, press F12 → Console, paste the snippet.
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

export function useTrialSyncHelperListener(onReady: () => void) {
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isIronwoodOrigin(event.origin)) return;
      if (!isIronwoodTrialSyncHelperMessage(event.data)) return;
      markTrialSyncHelperInstalled();
      onReady();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onReady]);
}
