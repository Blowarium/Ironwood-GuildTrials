"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MemberSkillProfileRow } from "@/lib/member-profile";
import {
  FIREFOX_ANDROID_TAMPERMONKEY_URL,
  TAMPERMONKEY_HOME_URL,
  USERSCRIPTS_IOS_APP_URL,
  buildIronwoodActionPlanFromRows,
  buildIronwoodImportLaunchUrl,
  buildIronwoodXpImportConsoleSnippet,
  buildStaticIronwoodXpImportBookmarklet,
  buildUserscriptInstallUrl,
  isXpImportHelperInstalled,
} from "@/lib/ironwood-xp-import";

export function IronwoodXpImportGuide({
  returnUrl,
  skillRows,
}: {
  returnUrl: string;
  skillRows: MemberSkillProfileRow[];
}) {
  const [helperReady, setHelperReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bookmarkletCopied, setBookmarkletCopied] = useState(false);
  const [importing, setImporting] = useState(false);

  const appOrigin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  useEffect(() => {
    setHelperReady(isXpImportHelperInstalled());
  }, []);

  const userscriptInstallUrl = useMemo(
    () => (appOrigin ? buildUserscriptInstallUrl(appOrigin) : ""),
    [appOrigin],
  );

  const actionPlan = useMemo(
    () => buildIronwoodActionPlanFromRows(skillRows),
    [skillRows],
  );

  const planSkillCount = Object.keys(actionPlan).length;

  const consoleSnippet = useMemo(
    () =>
      appOrigin
        ? buildIronwoodXpImportConsoleSnippet(appOrigin, returnUrl, actionPlan)
        : "",
    [appOrigin, returnUrl, actionPlan],
  );

  const staticBookmarklet = useMemo(() => buildStaticIronwoodXpImportBookmarklet(), []);

  const launchImport = useCallback(() => {
    if (!returnUrl) return;
    if (planSkillCount < 16) {
      window.alert(
        "Pick an Ironwood action for each skill in your profile first, then save before importing.",
      );
      return;
    }
    setImporting(true);
    window.open(buildIronwoodImportLaunchUrl(returnUrl, actionPlan), "_blank", "noopener,noreferrer");
    window.setTimeout(() => setImporting(false), 3000);
  }, [returnUrl, actionPlan, planSkillCount]);

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(consoleSnippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* user can select manually */
    }
  }

  async function copyBookmarklet() {
    try {
      await navigator.clipboard.writeText(staticBookmarklet);
      setBookmarkletCopied(true);
      window.setTimeout(() => setBookmarkletCopied(false), 2500);
    } catch {
      /* user can select manually */
    }
  }

  return (
    <div className="rounded-lg border border-orange-500/25 bg-orange-950/20 p-3 text-sm text-slate-300">
      <p className="font-medium text-orange-100">Import XP/h from Ironwood RPG</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        Opens each skill page you selected in your profile, reads Estimates XP/h, then fills
        values here. Enable <strong className="text-slate-300">Stats → Estimates</strong> in
        game if values are missing.
      </p>
      {planSkillCount < 16 && (
        <p className="mt-2 text-xs text-amber-300">
          Choose an Ironwood action for all 16 skills below before importing ({planSkillCount}/16
          ready).
        </p>
      )}

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
              Click below — Tampermonkey should pop up its own install dialog. Click{" "}
              <strong className="text-slate-300">Install</strong> there (not in the browser
              tab).
            </li>
          </ol>
          <a
            href={userscriptInstallUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-500 aria-disabled:pointer-events-none aria-disabled:opacity-50"
            aria-disabled={!userscriptInstallUrl}
          >
            Add import helper to Tampermonkey
          </a>
          <p className="text-[11px] text-slate-500">
            If you only see a page of code, Tampermonkey is not installed or not enabled on this
            site.
          </p>
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
          disabled={!returnUrl || importing || planSkillCount < 16}
          className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {importing ? "Opening Ironwood…" : "Import XP/h now"}
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
          Phone or tablet
        </summary>
        <div className="mt-3 space-y-4 leading-relaxed text-slate-400">
          <p>
            Use the same <strong className="text-slate-300">Import XP/h now</strong> button below
            after setup. Keep Guild Trials and Ironwood in the <strong className="text-slate-300">same
            browser</strong> so you return to your profile when the import finishes.
          </p>

          <div>
            <p className="font-medium text-slate-300">Android — Firefox (recommended, free)</p>
            <ol className="mt-1.5 list-decimal space-y-1.5 pl-4">
              <li>
                Install{" "}
                <a
                  href={FIREFOX_ANDROID_TAMPERMONKEY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 hover:underline"
                >
                  Tampermonkey in Firefox for Android
                </a>{" "}
                (Menu → Add-ons → Tampermonkey → add).
              </li>
              <li>
                Tap <strong className="text-slate-300">Add import helper to Tampermonkey</strong>{" "}
                above and install the script (same as desktop).
              </li>
              <li>Import XP/h now whenever you need fresh values.</li>
            </ol>
          </div>

          <div>
            <p className="font-medium text-slate-300">iPhone / iPad — Userscripts app (free)</p>
            <p className="mt-1">
              Tampermonkey on iOS is paid; the free{" "}
              <a
                href={USERSCRIPTS_IOS_APP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 hover:underline"
              >
                Userscripts
              </a>{" "}
              app works the same way in Safari.
            </p>
            <ol className="mt-1.5 list-decimal space-y-1.5 pl-4">
              <li>Install Userscripts from the App Store and enable it under Settings → Safari → Extensions.</li>
              <li>
                In Safari, open this profile and tap{" "}
                <strong className="text-slate-300">Add import helper to Tampermonkey</strong>{" "}
                above (the <code className="text-slate-500">.user.js</code> link works with
                Userscripts too).
              </li>
              <li>
                Tap the <strong className="text-slate-300">AA</strong> button in Safari’s address
                bar → Userscripts → install when prompted.
              </li>
              <li>Back in Guild Trials, tap Import XP/h now.</li>
            </ol>
          </div>

          <div>
            <p className="font-medium text-slate-300">No extension? Safari bookmark (one-time)</p>
            <ol className="mt-1.5 list-decimal space-y-1.5 pl-4">
              <li>Copy the bookmark link below.</li>
              <li>
                In Safari, add any bookmark, then edit it: name it{" "}
                <strong className="text-slate-300">Guild Trials XP Import</strong> and paste the
                copied text into the URL field.
              </li>
              <li>
                Tap <strong className="text-slate-300">Import XP/h now</strong> here — Ironwood
                opens in a new tab.
              </li>
              <li>
                Switch to that Ironwood tab, open Bookmarks, and tap{" "}
                <strong className="text-slate-300">Guild Trials XP Import</strong>. The import
                overlay should appear.
              </li>
            </ol>
            <button
              type="button"
              onClick={copyBookmarklet}
              className="mt-2 rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:border-slate-500"
            >
              {bookmarkletCopied ? "Bookmark link copied!" : "Copy bookmark link"}
            </button>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Run the bookmark on the Ironwood tab opened by Import XP/h now (that tab keeps the
              return link in its address bar). On iPhone, Firefox does not support Tampermonkey —
              use Safari with Userscripts above, or this bookmark in Firefox.
            </p>
          </div>
        </div>
      </details>

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
