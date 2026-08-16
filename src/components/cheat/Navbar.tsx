"use client";

import React, { useEffect, useState } from "react";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Terminal } from "lucide-react";

interface NavbarProps {
  onNavigateHome: () => void;
  onSearchFocus?: () => void;
}

export function Navbar({ onNavigateHome, onSearchFocus }: NavbarProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const scrolled = h.scrollTop;
      const total = h.scrollHeight - h.clientHeight;
      setProgress(total > 0 ? Math.min(100, (scrolled / total) * 100) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    let gPressed = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (isTyping) return;

      if (e.key === "/" && onSearchFocus) {
        e.preventDefault();
        onSearchFocus();
      } else if (e.key === "g" && !gPressed) {
        gPressed = true;
        if (gTimer) clearTimeout(gTimer);
        gTimer = setTimeout(() => {
          gPressed = false;
        }, 800);
      } else if (gPressed && e.key === "h") {
        gPressed = false;
        onNavigateHome();
      } else if (e.key === "t") {
        const cur =
          document.documentElement.getAttribute("data-theme") ?? "black-hole";
        const order = ["black-hole", "blueprint", "editorial"] as const;
        const next =
          order[(order.indexOf(cur as (typeof order)[number]) + 1) % order.length];
        document.dispatchEvent(
          new CustomEvent("cs-cycle-theme", { detail: next }),
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNavigateHome, onSearchFocus]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      {/* Reading progress bar */}
      <div
        className="absolute bottom-0 left-0 h-[2px] transition-[width] duration-100"
        style={{
          width: `${progress}%`,
          background: "linear-gradient(90deg, var(--primary), var(--accent))",
          boxShadow: "var(--glow-primary)",
        }}
        aria-hidden
      />
      <div className="max-w-6xl mx-auto px-3 sm:px-5 md:px-8 h-12 sm:h-14 flex items-center justify-between gap-2">
        <button
          onClick={onNavigateHome}
          className="flex items-center gap-1.5 sm:gap-2 group min-w-0"
          aria-label="Back to index"
        >
          <span
            className="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-md border border-border group-hover:border-primary/40 transition-colors"
            style={{
              background: "color-mix(in oklch, var(--primary) 8%, transparent)",
            }}
          >
            <Terminal
              className="h-3 w-3 sm:h-3.5 sm:w-3.5"
              style={{ color: "var(--primary)" }}
            />
          </span>
          <span className="font-mono text-xs sm:text-sm font-semibold tracking-tight truncate">
            cheat<span style={{ color: "var(--primary)" }}>_</span>sheet
          </span>
        </button>
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <LanguageSwitcher />
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  );
}
