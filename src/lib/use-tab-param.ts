import { useEffect, useMemo } from "react";

/**
 * Deterministic tab parsing with fallback and URL normalization.
 *
 * - Reads `?tab=` from the current URL (via URLSearchParams).
 * - If missing, empty, or not in `validTabs`, returns `defaultTab` and
 *   normalizes the URL via `history.replaceState()` (preserving all other
 *   query params). No new history entry is created, so the browser's Back
 *   button skips the invalid intermediate URL.
 * - If valid, returns the value unchanged and leaves the URL alone.
 */
export function useTabParam<T extends string>(
  validTabs: readonly T[],
  defaultTab: T,
): T {
  const { active, needsNormalize, normalizedSearch } = useMemo(() => {
    if (typeof window === "undefined") {
      return { active: defaultTab, needsNormalize: false, normalizedSearch: "" };
    }
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("tab");
    const isValid = raw !== null && raw !== "" && (validTabs as readonly string[]).includes(raw);
    if (isValid) {
      return { active: raw as T, needsNormalize: false, normalizedSearch: "" };
    }
    params.set("tab", defaultTab);
    const qs = params.toString();
    return {
      active: defaultTab,
      needsNormalize: true,
      normalizedSearch: qs ? `?${qs}` : "",
    };
  }, [validTabs, defaultTab, typeof window !== "undefined" ? window.location.search : ""]);

  useEffect(() => {
    if (!needsNormalize || typeof window === "undefined") return;
    const url = `${window.location.pathname}${normalizedSearch}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", url);
  }, [needsNormalize, normalizedSearch]);

  return active;
}
