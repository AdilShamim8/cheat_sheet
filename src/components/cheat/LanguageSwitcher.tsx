"use client";

import React from "react";
import { useLanguage } from "./LanguageProvider";
import { LANGUAGES, type LanguageCode } from "@/lib/i18n";
import { Globe, Check } from "lucide-react";

export function LanguageSwitcher() {
  const { lang, setLang } = useLanguage();
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  return (
    <div className="relative group">
      <button
        className="inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-1.5 rounded-md border border-border bg-card/50 text-xs font-mono hover:border-foreground/30 transition-colors"
        aria-label="Switch language"
        aria-haspopup="menu"
      >
        <Globe className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--accent)" }} />
        <span className="text-sm leading-none">{current.flag}</span>
        <span className="hidden md:inline">{current.code.toUpperCase()}</span>
      </button>
      <div
        role="menu"
        className="absolute right-0 top-full mt-1 w-56 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-popover shadow-lg p-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50"
      >
        <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
          UI Language
        </div>
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            onClick={() => setLang(l.code as LanguageCode)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-muted/60 transition-colors"
            role="menuitemradio"
            aria-checked={lang === l.code}
          >
            <span className="text-base leading-none">{l.flag}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium flex items-center gap-1.5">
                {l.name}
                {lang === l.code && (
                  <Check
                    className="h-3 w-3"
                    style={{ color: "var(--accent)" }}
                  />
                )}
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {l.englishName}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
