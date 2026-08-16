"use client";

import React, { useEffect } from "react";
import { useTheme, type ThemeName } from "@/hooks/use-theme";
import { Palette, Check } from "lucide-react";

export function ThemeSwitcher() {
  const { theme, setTheme, themes } = useTheme();

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as ThemeName;
      if (detail) setTheme(detail);
    };
    document.addEventListener("cs-cycle-theme", handler);
    return () => document.removeEventListener("cs-cycle-theme", handler);
  }, [setTheme]);

  return (
    <div className="relative group">
      <button
        className="inline-flex items-center gap-1.5 px-1.5 sm:px-2.5 py-1.5 rounded-md border border-border bg-card/50 text-xs font-mono hover:border-foreground/30 transition-colors"
        aria-label="Switch theme"
        aria-haspopup="menu"
      >
        <Palette
          className="h-3.5 w-3.5 shrink-0"
          style={{ color: "var(--primary)" }}
        />
        <span className="hidden sm:inline">{theme.replace("-", " ")}</span>
      </button>
      <div
        role="menu"
        className="absolute right-0 top-full mt-1 w-60 rounded-lg border border-border bg-popover shadow-lg p-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50"
      >
        <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
          Theme
        </div>
        {themes.map((t) => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id as ThemeName)}
            className="w-full flex items-start gap-2 px-2 py-2 rounded text-left hover:bg-muted/60 transition-colors"
            role="menuitemradio"
            aria-checked={theme === t.id}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium flex items-center gap-1.5">
                {t.name}
                {theme === t.id && (
                  <Check
                    className="h-3 w-3"
                    style={{ color: "var(--primary)" }}
                  />
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t.description}
              </div>
            </div>
            <ThemeSwatch themeId={t.id} />
          </button>
        ))}
        <div className="px-2 pt-1.5 pb-1 mt-1 border-t border-border text-[10px] text-muted-foreground font-mono">
          Press{" "}
          <kbd className="px-1 py-0.5 rounded border border-border bg-muted">
            t
          </kbd>{" "}
          to cycle
        </div>
      </div>
    </div>
  );
}

function ThemeSwatch({ themeId }: { themeId: ThemeName }) {
  const palettes: Record<ThemeName, string[]> = {
    "black-hole": ["#1a0d2e", "#9333ea", "#22d3ee"],
    blueprint: ["#1e3a5f", "#7dd3fc", "#fbbf24"],
    editorial: ["#ffffff", "#7c3aed", "#0ea5e9"],
  };
  const colors = palettes[themeId];
  return (
    <div className="flex shrink-0 -space-x-1">
      {colors.map((c, i) => (
        <span
          key={i}
          className="h-3.5 w-3.5 rounded-full border border-white/20"
          style={{ background: c }}
        />
      ))}
    </div>
  );
}
