"use client";

import React, { useMemo, useRef, useState } from "react";
import { ALL_SHEETS } from "@/lib/registry";
import { CATEGORIES, TIER_LABEL, type CheatSheet, type Tier } from "@/lib/types";
import { sheetPath } from "@/hooks/use-hash-route";
import { useT } from "./LanguageProvider";
import {
  Search,
  X,
  Globe,
  Github,
  Linkedin,
  Twitter,
  BookMarked,
  BookOpen,
} from "lucide-react";

interface HubViewProps {
  onNavigate: (to: string) => void;
}

const tierClass: Record<Tier, string> = {
  1: "tier-1",
  2: "tier-2",
  3: "tier-3",
  ml: "tier-ml",
  sys: "tier-sys",
  topic: "tier-topic",
};

function SheetCard({
  sheet,
  onNavigate,
}: {
  sheet: CheatSheet;
  onNavigate: (to: string) => void;
}) {
  const { t } = useT();
  const tierBadge = tierClass[sheet.tier];
  return (
    <button
      onClick={() => onNavigate(sheetPath(sheet.category, sheet.slug))}
      className={`cheat-card-hover text-left rounded-lg border bg-card p-4 md:p-5 border-border ${tierBadge} flex flex-col h-full`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-[15px] md:text-base tracking-tight truncate">
            {sheet.name}
          </h3>
          <div className="text-[11px] font-mono text-muted-foreground mt-0.5 truncate">
            {t(`category.${sheet.category}`)}
            {sheet.year ? ` · ${sheet.year}` : ""}
          </div>
        </div>
        <span
          className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider border"
          style={{
            background: "var(--tier-bg)",
            color: "var(--tier-fg)",
            borderColor: "var(--tier-bd)",
          }}
        >
          {TIER_LABEL[sheet.tier].split(" ")[0]}
        </span>
      </div>
      <p className="text-[12.5px] text-muted-foreground leading-relaxed line-clamp-2 flex-1">
        {sheet.tagline}
      </p>
      {sheet.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {sheet.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/60"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// ─── Developer footer (Adil Shamim) ─────────────────────────────────────────
function DeveloperFooter() {
  const { t } = useT();
  const links = [
    { label: "Website", url: "https://www.adilshamim.me/", icon: Globe },
    { label: "LinkedIn", url: "https://www.linkedin.com/in/adilshamim8", icon: Linkedin },
    { label: "GitHub", url: "https://github.com/AdilShamim8/cheat_sheet", icon: Github },
    { label: "Kaggle", url: "https://www.kaggle.com/adilshamim8", icon: BookMarked },
    { label: "Twitter / X", url: "https://x.com/adil_shamim8", icon: Twitter },
    { label: "Medium", url: "https://adilshamim8.medium.com/", icon: BookOpen },
  ];
  return (
    <footer className="mt-auto border-t border-border bg-card/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-5 md:px-8 py-8 sm:py-10">
        <div className="grid md:grid-cols-[1fr_auto] gap-6 items-start">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-1.5">
              {t("footer.builtBy")}
            </div>
            <div className="text-xl sm:text-2xl font-semibold tracking-tight mb-1">
              Adil Shamim
            </div>
            <div className="text-[13px] text-muted-foreground mb-3">
              Developer · Engineer · {t("footer.copyright")}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              {t("footer.doctrine", { n: String(ALL_SHEETS.length) })}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-2">
              {t("footer.connect")}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {links.map((l) => {
                const Icon = l.icon;
                return (
                  <a
                    key={l.label}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-card hover:border-primary/40 hover:text-primary transition-colors text-[12px]"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{l.label}</span>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function HubView({ onNavigate }: HubViewProps) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string>("all");
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALL_SHEETS.filter((s) => {
      if (activeCat !== "all" && s.category !== activeCat) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.tagline.toLowerCase().includes(q) ||
        s.tags.some((tag) => tag.toLowerCase().includes(q)) ||
        s.slug.toLowerCase().includes(q)
      );
    });
  }, [query, activeCat]);

  const grouped = useMemo(() => {
    const out: Record<string, CheatSheet[]> = {};
    for (const s of filtered) (out[s.category] ||= []).push(s);
    return out;
  }, [filtered]);

  const catCount = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of ALL_SHEETS) c[s.category] = (c[s.category] || 0) + 1;
    return c;
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* ─── Hero ───────────────────────────────────────────────────── */}
      <section className="cheat-hero-gradient relative overflow-hidden border-b border-border">
        <div
          className="cheat-grid-bg absolute inset-0 opacity-60"
          aria-hidden
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-5 md:px-8 pt-10 sm:pt-16 md:pt-24 pb-8 sm:pb-12 md:pb-16">
          <div className="flex items-center gap-2 mb-4 sm:mb-6">
            <span
              className="text-[10px] font-mono uppercase tracking-[0.2em] sm:tracking-[0.25em] px-2 py-1 rounded border whitespace-nowrap"
              style={{
                borderColor:
                  "color-mix(in oklch, var(--primary) 40%, transparent)",
                color: "var(--primary)",
                background:
                  "color-mix(in oklch, var(--primary) 8%, transparent)",
              }}
            >
              v2 · {ALL_SHEETS.length} {t("hub.badge")}
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tighter mb-3 sm:mb-4 max-w-4xl">
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(120deg, var(--foreground) 30%, var(--primary) 100%)",
              }}
            >
              cheat_sheet
            </span>
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-2xl leading-relaxed mb-6 sm:mb-8">
            {t("app.description")}
          </p>

          {/* Search */}
          <div className="relative max-w-2xl">
            <Search className="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("hub.search.placeholder")}
              className="w-full pl-9 sm:pl-10 pr-12 sm:pr-16 py-2.5 sm:py-3 rounded-lg border border-border bg-background/60 backdrop-blur text-sm focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all min-w-0"
              aria-label={t("nav.search")}
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5 bg-muted/40 hidden sm:block pointer-events-none">
              /
            </kbd>
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3 sm:right-10 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted transition-colors"
                aria-label={t("hub.clear")}
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Category filter pills — horizontally scrollable on mobile, wrap on desktop */}
          <div
            className="flex sm:flex-wrap gap-1.5 mt-4 overflow-x-auto sm:overflow-visible pb-1 sm:pb-0 -mx-4 sm:mx-0 px-4 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x"
            style={{
              maskImage:
                "linear-gradient(to right, transparent 0, black 12px, black calc(100% - 12px), transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to right, transparent 0, black 12px, black calc(100% - 12px), transparent 100%)",
            }}
          >
            <FilterPill
              active={activeCat === "all"}
              onClick={() => setActiveCat("all")}
              label={t("hub.filter.all")}
              count={ALL_SHEETS.length}
            />
            {CATEGORIES.map((c) => (
              <FilterPill
                key={c.slug}
                active={activeCat === c.slug}
                onClick={() => setActiveCat(c.slug)}
                label={t(`category.${c.slug}`)}
                count={catCount[c.slug] || 0}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ─── Results ────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-5 md:px-8 py-8 sm:py-12 md:py-16 w-full flex-1">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div className="text-xs sm:text-sm text-muted-foreground">
            <span className="font-mono text-foreground">{filtered.length}</span>
            {" / "}
            <span className="font-mono">{ALL_SHEETS.length}</span>
            {query && (
              <>
                {" · "}
                {t("hub.results.matching", { query })}
              </>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 sm:py-20">
            <div className="text-4xl mb-3 opacity-40">∅</div>
            <p className="text-muted-foreground text-sm">
              {t("hub.empty.body")}
            </p>
          </div>
        ) : (
          <div className="space-y-10 sm:space-y-12">
            {CATEGORIES.filter((c) => grouped[c.slug]?.length > 0).map(
              (cat) => (
                <div key={cat.slug} className="cheat-reveal">
                  <div className="flex items-baseline gap-3 mb-3 sm:mb-4 pb-2 border-b border-border">
                    <span
                      className="font-mono text-xl sm:text-2xl"
                      style={{ color: "var(--primary)" }}
                    >
                      {cat.icon}
                    </span>
                    <h2 className="text-lg sm:text-xl md:text-2xl font-semibold tracking-tight">
                      {t(`category.${cat.slug}`)}
                    </h2>
                    <span className="text-xs font-mono text-muted-foreground">
                      {grouped[cat.slug].length}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-4 -mt-2">
                    {t(`category.${cat.slug}.desc`)}
                  </p>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
                    {grouped[cat.slug].map((s) => (
                      <SheetCard
                        key={s.slug}
                        sheet={s}
                        onNavigate={onNavigate}
                      />
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </section>

      <DeveloperFooter />
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] sm:text-[12px] font-mono border transition-all whitespace-nowrap shrink-0 ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background/40 border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
      }`}
    >
      <span>{label}</span>
      <span className={active ? "opacity-70" : "opacity-50"}>{count}</span>
    </button>
  );
}

export function focusHubSearch() {
  const input = document.querySelector(
    'input[type="search"]',
  ) as HTMLInputElement | null;
  input?.focus();
  input?.select();
}
