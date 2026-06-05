"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TAMPERMONKEY_HOME_URL,
  buildIronwoodImportLaunchUrl,
  buildIronwoodXpImportConsoleSnippet,
  buildTampermonkeyInstallUrl,
  isXpImportHelperInstalled,
  markXpImportHelperInstalled,
} from "@/lib/ironwood-xp-import";

export function IronwoodXpImportGuide({ returnUrl }: { returnUrl: string }) {
  const [helperReady, setHelperReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [importing, setImporting] = useState(false);

  const appOrigin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  useEffect(() => {
    setHelperReady(isXpImportHelperInstalled());
  }, []);

  const tampermonkeyInstallUrl = useMemo(
    () => (appOrigin ? buildTampermonkeyInstallUrl(appOrigin) : ""),
    [appOrigin],
  );

  const consoleSnippet = useMemo(
    () => (appOrigin ? buildIronwoodXpImportConsoleSnippet(appOrigin, returnUrl) : ""),
    [appOrigin, returnUrl],
  );

  const launchImport = useCallback(() => {
    if (!returnUrl) return;
    setImporting(true);
    window.open(buildIronwoodImportLaunchUrl(returnUrl), "_blank", "noopener,noreferrer");
    window.setTimeout(() => setImporting(false), 3000);
  }, [returnUrl]);

  function installHelper() {
    if (!tampermonkeyInstallUrl) return;
    window.open(tampermonkeyInstallUrl, "_blank", "noopener,noreferrer");
    markXpImportHelperInstalled();
    setHelperReady(true);
  }

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(consoleSnippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* user can select manually */
    }
  }

  return (
    <div className="rounded-lg border border-orange-500/25 bg-orange-950/20 p-3 text-sm text-slate-300">
      <p className="font-medium text-orange-100">Import XP/h from Ironwood RPG</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        Reads Estimates XP/h from every guild skill while you are logged in, then fills your
        profile here. Enable <strong className="text-slate-300">Stats → Estimates</strong> in
        game if values are missing.
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
              Click below — Tampermonkey opens an install prompt. Confirm once with{" "}
              <strong className="text-slate-300">Install</strong>.
            </li>
          </ol>
          <button
            type="button"
            onClick={installHelper}
            disabled={!tampermonkeyInstallUrl}
            className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
          >
            Add import helper to Tampermonkey
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-emerald-400/90">
          Import helper installed — use the button below whenever you want fresh XP/h values.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={launchImport}
          disabled={!returnUrl || importing}
          className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {importing ? "Opening Ironwood…" : "Import XP/h now"}
        </button>
        {helperReady && (
          <button
            type="button"
            onClick={installHelper}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-400 hover:border-slate-500"
          >
            Reinstall helper
          </button>
        )}
      </div>

      <details className="mt-3 text-xs text-slate-500">
        <summary className="cursor-pointer text-slate-400 hover:text-slate-300">
          Manual fallback (no Tampermonkey)
        </summary>
        <p className="mt-2 leading-relaxed">
          Open ironwoodrpg.com, press F12 → Console, paste the snippet, and press Enter.
        </p>
        <button
          type="button"
          onClick={copySnippet}
          className="mt-2 rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:border-slate-500"
        >
          {copied ? "Copied!" : "Copy console snippet"}
        </button>
      </details>
    </div>
  );
}
