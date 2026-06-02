import { GUIDE_DISMISSED_STORAGE_KEY } from "./constants";

export function isGuideDismissed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(GUIDE_DISMISSED_STORAGE_KEY) === "1";
}

export function setGuideDismissed(dismissed: boolean): void {
  if (typeof window === "undefined") return;
  if (dismissed) {
    localStorage.setItem(GUIDE_DISMISSED_STORAGE_KEY, "1");
  } else {
    localStorage.removeItem(GUIDE_DISMISSED_STORAGE_KEY);
  }
}
