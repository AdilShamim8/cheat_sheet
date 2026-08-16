"use client";

import { useCallback, useState } from "react";

export type ThemeName = "black-hole" | "blueprint" | "editorial";

export const THEMES: { id: ThemeName; name: string; description: string }[] = [
  { id: "black-hole", name: "Black Hole", description: "Dark, high-contrast, gravitational hero" },
  { id: "blueprint", name: "Blueprint", description: "Schematic / technical-drawing aesthetic" },
  { id: "editorial", name: "Editorial", description: "High-contrast light for accessibility" },
];

const STORAGE_KEY = "cs-theme";
const VALID: ThemeName[] = ["black-hole", "blueprint", "editorial"];

function readInitialTheme(): ThemeName {
  if (typeof document === "undefined") return "black-hole";
  // The inline <head> script has already set data-theme before React hydrates.
  const attr = document.documentElement.getAttribute("data-theme") as ThemeName | null;
  if (attr && VALID.includes(attr)) return attr;
  return "black-hole";
}

export function useTheme() {
  // Lazy initializer reads what the head script already applied — no effect,
  // no cascading render, no hydration mismatch.
  const [theme, setThemeState] = useState<ThemeName>(readInitialTheme);

  const setTheme = useCallback((t: ThemeName) => {
    setThemeState(t);
    document.documentElement.setAttribute("data-theme", t);
    if (t === "black-hole") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    try { localStorage.setItem(STORAGE_KEY, t); } catch {}
  }, []);

  return { theme, setTheme, themes: THEMES };
}
