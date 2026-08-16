"use client";

import React, { useEffect, useState } from "react";
import type { CheatSheet, Tier, ConstructRow, CodeBlock as CodeBlockType, QuickFact } from "@/lib/types";
import { SECTION_DEFS } from "@/lib/types";
import { CodeBlock } from "./CodeBlock";
import { useT } from "./LanguageProvider";
import {
  AlertTriangle, ArrowLeftRight, BookOpen, Boxes, Code2, Compass, FileText,
  FlaskConical, FunctionSquare, Gauge, GitBranch, History, ListChecks, MessageCircleQuestion,
  Package, Plus, Repeat, Scale, ShieldAlert, Zap, ExternalLink, Hash, ArrowLeft,
  Clock, Check, X, Github, Linkedin, Twitter, Globe, BookMarked,
} from "lucide-react";
import { TIER_LABEL } from "@/lib/types";

interface SheetViewProps {
  sheet: CheatSheet;
  onNavigateHome: () => void;
}

const tierClass: Record<Tier, string> = {
  1: "tier-1", 2: "tier-2", 3: "tier-3",
  ml: "tier-ml", sys: "tier-sys", topic: "tier-topic",
};

// Map icon string names to components
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Zap, Compass, ListChecks, Code2, AlertTriangle, FileText, BookOpen,
  Boxes, Plus, ArrowLeftRight, Repeat, FunctionSquare, ShieldAlert,
  GitBranch, FlaskConical, Gauge, Package, History, MessageCircleQuestion, Scale,
};

function SectionHeader({
  iconName, num, title, subtitle,
}: { iconName: string; num: string; title: string; subtitle: string }) {
  const Icon = ICONS[iconName] ?? FileText;
  return (
    <header className="flex items-start gap-2.5 sm:gap-3 mb-4 sm:mb-5 mt-10 sm:mt-14 first:mt-0 scroll-mt-20" data-section-header>
      <div
        className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-md border"
        style={{
          borderColor: "var(--border)",
          background: "color-mix(in oklch, var(--primary) 10%, transparent)",
          color: "var(--primary)",
        }}
      >
        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
          §{num}
        </div>
        <h2 className="text-lg sm:text-xl md:text-2xl font-semibold tracking-tight break-words">{title}</h2>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
    </header>
  );
}

function ConstructTable({ rows, t }: { rows: ConstructRow[]; t: (k: string) => string }) {
  return (
    <>
      {/* Mobile: card layout (each row becomes a card) */}
      <div className="sm:hidden space-y-2">
        {rows.map((row, i) => (
          <div
            key={i}
            className="rounded-md border border-border bg-card p-3"
          >
            <code className="font-mono text-[12px] text-foreground break-all block mb-1.5">
              {row.syntax}
            </code>
            <p className="text-[12.5px] text-muted-foreground leading-relaxed mb-1.5">
              {row.behavior}
            </p>
            <p className="text-[11px] text-muted-foreground italic leading-relaxed">
              → {row.when}
            </p>
          </div>
        ))}
      </div>

      {/* Desktop: table layout */}
      <div className="hidden sm:block cheat-scroll-x overflow-x-auto rounded-md">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 px-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground w-1/3 whitespace-nowrap">
                {t("label.syntax")}
              </th>
              <th className="py-2 px-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {t("label.behavior")}
              </th>
              <th className="py-2 px-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hidden md:table-cell">
                {t("label.when")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-border/50 align-top hover:bg-muted/30 transition-colors"
              >
                <td className="py-2.5 px-3">
                  <code className="font-mono text-[12.5px] text-foreground">
                    {row.syntax}
                  </code>
                </td>
                <td className="py-2.5 px-3 text-[13px] text-muted-foreground leading-relaxed">
                  {row.behavior}
                </td>
                <td className="py-2.5 px-3 text-[13px] text-muted-foreground hidden md:table-cell leading-relaxed">
                  {row.when}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CodeBlocks({ blocks }: { blocks: CodeBlockType[] }) {
  return (
    <div>
      {blocks.map((p, i) => (
        <CodeBlock key={i} code={p.code} lang={p.lang} caption={p.caption} />
      ))}
    </div>
  );
}

function PitfallList({ sheet, t }: { sheet: CheatSheet; t: (k: string) => string }) {
  return (
    <ol className="space-y-3">
      {sheet.pitfalls.map((p, i) => (
        <li
          key={i}
          className="rounded-lg border p-4"
          style={{
            borderColor: "color-mix(in oklch, var(--destructive) 25%, var(--border))",
            background: "color-mix(in oklch, var(--destructive) 3%, var(--card))",
          }}
        >
          <div className="flex items-start gap-3">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-mono font-semibold"
              style={{
                background: "color-mix(in oklch, var(--destructive) 20%, transparent)",
                color: "var(--destructive)",
              }}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <h4 className="font-medium text-[14.5px] mb-1">{p.title}</h4>
              <p className="text-[13px] text-muted-foreground leading-relaxed mb-2">{p.symptom}</p>
              <p className="text-[13px] leading-relaxed">
                <span className="font-mono text-[11px] uppercase tracking-wider mr-1.5" style={{ color: "var(--accent)" }}>
                  {t("label.fix")} →
                </span>
                {p.fix}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function QuickRefGrid({ facts }: { facts: QuickFact[] }) {
  return (
    <div className="grid sm:grid-cols-2 gap-2">
      {facts.map((f, i) => (
        <div
          key={i}
          className="rounded-md border border-border bg-card p-3 text-[13px] leading-relaxed flex items-start gap-2"
        >
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--primary)" }} />
          <div>
            {f.tag && (
              <span
                className="inline-block mr-2 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  background: "color-mix(in oklch, var(--accent) 12%, transparent)",
                  color: "var(--accent-foreground)",
                }}
              >
                {f.tag}
              </span>
            )}
            <span>{f.fact}</span>
          </div>
        </div>
      ))}
    </div>
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
    <footer className="mt-16 pt-10 border-t border-border bg-card/30">
      <div className="max-w-6xl mx-auto px-5 md:px-8 py-8">
        <div className="grid md:grid-cols-[1fr_auto] gap-6 items-start">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-1.5">
              {t("footer.builtBy")}
            </div>
            <div className="text-xl font-semibold tracking-tight mb-1">Adil Shamim</div>
            <div className="text-[13px] text-muted-foreground mb-3">
              Developer · Engineer · {t("footer.copyright")}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              {t("footer.doctrine", { n: String(39) })}
            </div>
          </div>
          <div>
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

// ─── Main SheetView ─────────────────────────────────────────────────────────

export function SheetView({ sheet, onNavigateHome }: SheetViewProps) {
  const { t } = useT();
  const tierBadge = tierClass[sheet.tier];
  const [activeSection, setActiveSection] = useState<string>("1");

  // Compute reading time from content length
  const readingTime = sheet.readingTime ?? Math.max(3, Math.round(
    (sheet.tldr.join(" ").length +
     sheet.mentalModel.body.length +
     sheet.constructs.reduce((a, r) => a + r.behavior.length + r.when.length, 0) +
     sheet.patterns.reduce((a, p) => a + p.code.length, 0) +
     sheet.pitfalls.reduce((a, p) => a + p.symptom.length + p.fix.length, 0) +
     sheet.quickReference.reduce((a, f) => a + f.fact.length, 0)) / 1500
  ));

  // Build list of present sections (in canonical order)
  const presentSections = SECTION_DEFS.filter((def) => {
    if (!def.optional) return true;
    const key = def.id as keyof CheatSheet;
    const v = sheet[key];
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return true;
  });

  // Scroll-spy: highlight the section currently in view
  useEffect(() => {
    const headers = Array.from(document.querySelectorAll<HTMLElement>("[data-section-header]"));
    if (headers.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          const num = visible[0].target.querySelector(".text-\\[10px\\]")?.textContent?.replace("§", "");
          if (num) setActiveSection(num);
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );
    headers.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [sheet.slug]);

  return (
    <article className="min-h-screen flex flex-col">
      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <header className="cheat-hero-gradient relative overflow-hidden border-b border-border">
        <div className="cheat-grid-bg absolute inset-0 opacity-50" aria-hidden />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-5 md:px-8 py-8 sm:py-12 md:py-16">
          <button
            onClick={onNavigateHome}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4 sm:mb-6 font-mono"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("nav.home")}
          </button>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${tierBadge}`}
              style={{
                background: "var(--tier-bg)",
                color: "var(--tier-fg)",
                borderColor: "var(--tier-bd)",
              }}
            >
              {t(`tier.${sheet.tier}`)}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider text-muted-foreground border border-border bg-muted/50">
              {t(`category.${sheet.category}`)}
            </span>
            {sheet.year && (
              <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-muted-foreground font-mono">
                {t("label.year")} {sheet.year}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-muted-foreground font-mono">
              <Clock className="h-3 w-3" />
              {t("label.readingTime", { n: readingTime })}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight mb-3 break-words">
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(120deg, var(--foreground), color-mix(in oklch, var(--primary) 70%, var(--foreground)))",
              }}
            >
              {sheet.name}
            </span>
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-2xl leading-relaxed">
            {sheet.tagline}
          </p>

          {sheet.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 sm:gap-1.5 mt-4 sm:mt-5">
              {sheet.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded border border-border bg-muted/40 text-muted-foreground"
                >
                  <Hash className="h-2.5 w-2.5" />
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ─── Body ─────────────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-5 md:px-8 py-8 sm:py-10 md:py-14 w-full">
        <div className="grid lg:grid-cols-[1fr_240px] gap-8 lg:gap-10">
          <div className="min-w-0 max-w-3xl cheat-prose">
            {/* §1 TL;DR */}
            <section className="cheat-reveal" data-section-id="1">
              <SectionHeader iconName="Zap" num="1" title={t("sec.tldr.title")} subtitle={t("sec.tldr.sub")} />
              <div className="space-y-3">
                {sheet.tldr.map((line, i) => (
                  <p key={i} className="text-[15px] leading-relaxed">{line}</p>
                ))}
              </div>
            </section>

            {/* §2 Mental Model */}
            <section className="cheat-reveal" data-section-id="2">
              <SectionHeader iconName="Compass" num="2" title={t("sec.mental.title")} subtitle={t("sec.mental.sub")} />
              <div
                className="rounded-lg border p-5 md:p-6"
                style={{
                  borderColor: "var(--border)",
                  background: "color-mix(in oklch, var(--primary) 4%, var(--card))",
                }}
              >
                <h3 className="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-2">
                  {sheet.mentalModel.title}
                </h3>
                <p className="text-[15px] leading-relaxed whitespace-pre-line">{sheet.mentalModel.body}</p>
              </div>
            </section>

            {/* §3 Constructs */}
            <section className="cheat-reveal" data-section-id="3">
              <SectionHeader iconName="ListChecks" num="3" title={t("sec.constructs.title")} subtitle={t("sec.constructs.sub")} />
              <ConstructTable rows={sheet.constructs} t={t} />
            </section>

            {/* §4 Patterns */}
            <section className="cheat-reveal" data-section-id="4">
              <SectionHeader iconName="Code2" num="4" title={t("sec.patterns.title")} subtitle={t("sec.patterns.sub")} />
              <CodeBlocks blocks={sheet.patterns} />
            </section>

            {/* §5 Pitfalls */}
            <section className="cheat-reveal" data-section-id="5">
              <SectionHeader iconName="AlertTriangle" num="5" title={t("sec.pitfalls.title")} subtitle={t("sec.pitfalls.sub")} />
              <PitfallList sheet={sheet} t={t} />
            </section>

            {/* §6 Quick Ref */}
            <section className="cheat-reveal" data-section-id="6">
              <SectionHeader iconName="FileText" num="6" title={t("sec.quick.title")} subtitle={t("sec.quick.sub")} />
              <QuickRefGrid facts={sheet.quickReference} />
            </section>

            {/* §7 Go Deeper */}
            <section className="cheat-reveal" data-section-id="7">
              <SectionHeader iconName="BookOpen" num="7" title={t("sec.deeper.title")} subtitle={t("sec.deeper.sub")} />
              <ul className="space-y-2">
                {sheet.goDeeper.map((l, i) => (
                  <li key={i}>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start gap-2 rounded-md border border-border bg-card p-3 hover:border-primary/40 transition-colors"
                    >
                      <ExternalLink className="h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-primary transition-colors" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-[14px] group-hover:text-primary transition-colors">{l.title}</div>
                        <div className="text-[12.5px] text-muted-foreground mt-0.5">{l.note}</div>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            </section>

            {/* §8 Data Types */}
            {sheet.dataTypes && (
              <section className="cheat-reveal" data-section-id="8">
                <SectionHeader iconName="Boxes" num="8" title={t("sec.datatypes.title")} subtitle={t("sec.datatypes.sub")} />
                <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mt-4 mb-2">{t("label.primitives")}</h3>
                <ConstructTable rows={sheet.dataTypes.primitives} t={t} />
                <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mt-6 mb-2">{t("label.collections")}</h3>
                <ConstructTable rows={sheet.dataTypes.collections} t={t} />
                <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mt-6 mb-2">{t("label.custom")}</h3>
                <ConstructTable rows={sheet.dataTypes.custom} t={t} />
              </section>
            )}

            {/* §9 Operators */}
            {sheet.operators && sheet.operators.length > 0 && (
              <section className="cheat-reveal" data-section-id="9">
                <SectionHeader iconName="Plus" num="9" title={t("sec.operators.title")} subtitle={t("sec.operators.sub")} />
                <ConstructTable rows={sheet.operators} t={t} />
              </section>
            )}

            {/* §10 I/O */}
            {sheet.inputOutput && sheet.inputOutput.length > 0 && (
              <section className="cheat-reveal" data-section-id="10">
                <SectionHeader iconName="ArrowLeftRight" num="10" title={t("sec.io.title")} subtitle={t("sec.io.sub")} />
                <CodeBlocks blocks={sheet.inputOutput} />
              </section>
            )}

            {/* §11 Loops */}
            {sheet.loops && sheet.loops.length > 0 && (
              <section className="cheat-reveal" data-section-id="11">
                <SectionHeader iconName="Repeat" num="11" title={t("sec.loops.title")} subtitle={t("sec.loops.sub")} />
                <CodeBlocks blocks={sheet.loops} />
              </section>
            )}

            {/* §12 Functions */}
            {sheet.functions && sheet.functions.length > 0 && (
              <section className="cheat-reveal" data-section-id="12">
                <SectionHeader iconName="FunctionSquare" num="12" title={t("sec.functions.title")} subtitle={t("sec.functions.sub")} />
                <CodeBlocks blocks={sheet.functions} />
              </section>
            )}

            {/* §13 Error handling */}
            {sheet.errorHandling && sheet.errorHandling.length > 0 && (
              <section className="cheat-reveal" data-section-id="13">
                <SectionHeader iconName="ShieldAlert" num="13" title={t("sec.errors.title")} subtitle={t("sec.errors.sub")} />
                <CodeBlocks blocks={sheet.errorHandling} />
              </section>
            )}

            {/* §14 Concurrency */}
            {sheet.concurrency && sheet.concurrency.length > 0 && (
              <section className="cheat-reveal" data-section-id="14">
                <SectionHeader iconName="GitBranch" num="14" title={t("sec.concurrency.title")} subtitle={t("sec.concurrency.sub")} />
                <CodeBlocks blocks={sheet.concurrency} />
              </section>
            )}

            {/* §15 Testing */}
            {sheet.testing && sheet.testing.length > 0 && (
              <section className="cheat-reveal" data-section-id="15">
                <SectionHeader iconName="FlaskConical" num="15" title={t("sec.testing.title")} subtitle={t("sec.testing.sub")} />
                <CodeBlocks blocks={sheet.testing} />
              </section>
            )}

            {/* §16 Performance */}
            {sheet.performance && sheet.performance.length > 0 && (
              <section className="cheat-reveal" data-section-id="16">
                <SectionHeader iconName="Gauge" num="16" title={t("sec.perf.title")} subtitle={t("sec.perf.sub")} />
                <QuickRefGrid facts={sheet.performance} />
              </section>
            )}

            {/* §17 Ecosystem */}
            {sheet.ecosystem && sheet.ecosystem.length > 0 && (
              <section className="cheat-reveal" data-section-id="17">
                <SectionHeader iconName="Package" num="17" title={t("sec.ecosystem.title")} subtitle={t("sec.ecosystem.sub")} />
                <div className="grid sm:grid-cols-2 gap-2">
                  {sheet.ecosystem.map((tool, i) => (
                    <div
                      key={i}
                      className="rounded-md border border-border bg-card p-3"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[13px] font-semibold">{tool.tool}</span>
                        {tool.category && (
                          <span
                            className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
                            style={{
                              background: "color-mix(in oklch, var(--accent) 12%, transparent)",
                              color: "var(--accent-foreground)",
                            }}
                          >
                            {tool.category}
                          </span>
                        )}
                      </div>
                      <div className="text-[12.5px] text-muted-foreground leading-relaxed">{tool.purpose}</div>
                      {tool.url && (
                        <a
                          href={tool.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] mt-2 hover:text-primary transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                          docs
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* §18 Version History */}
            {sheet.versionHistory && sheet.versionHistory.length > 0 && (
              <section className="cheat-reveal" data-section-id="18">
                <SectionHeader iconName="History" num="18" title={t("sec.versions.title")} subtitle={t("sec.versions.sub")} />
                <ol className="relative border-l border-border ml-3 space-y-4">
                  {sheet.versionHistory.map((v, i) => (
                    <li key={i} className="pl-4 relative">
                      <span
                        className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2"
                        style={{
                          background: "var(--background)",
                          borderColor: "var(--primary)",
                        }}
                      />
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-[13px] font-semibold" style={{ color: "var(--primary)" }}>
                          {v.version}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground">{v.year}</span>
                      </div>
                      <p className="text-[13px] text-muted-foreground mt-0.5 leading-relaxed">{v.highlight}</p>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {/* §19 Interview */}
            {sheet.interview && sheet.interview.length > 0 && (
              <section className="cheat-reveal" data-section-id="19">
                <SectionHeader iconName="MessageCircleQuestion" num="19" title={t("sec.interview.title")} subtitle={t("sec.interview.sub")} />
                <div className="space-y-2">
                  {sheet.interview.map((item, i) => (
                    <details
                      key={i}
                      className="group rounded-md border border-border bg-card overflow-hidden"
                    >
                      <summary className="flex items-start gap-2 p-3 cursor-pointer list-none">
                        <span
                          className="shrink-0 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded mt-0.5"
                          style={{
                            background: item.difficulty === "hard"
                              ? "color-mix(in oklch, var(--destructive) 18%, transparent)"
                              : item.difficulty === "medium"
                              ? "color-mix(in oklch, var(--chart-3) 18%, transparent)"
                              : "color-mix(in oklch, var(--chart-4) 18%, transparent)",
                            color: item.difficulty === "hard" ? "var(--destructive)" : "var(--foreground)",
                          }}
                        >
                          {item.difficulty ?? "med"}
                        </span>
                        <span className="text-[13.5px] font-medium flex-1">{item.q}</span>
                        <span className="text-muted-foreground text-xs group-open:rotate-180 transition-transform">▼</span>
                      </summary>
                      <div className="px-3 pb-3 pt-1 text-[13px] text-muted-foreground leading-relaxed border-t border-border/50">
                        {item.a}
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            )}

            {/* §20 Comparisons */}
            {sheet.comparisons && sheet.comparisons.length > 0 && (
              <section className="cheat-reveal" data-section-id="20">
                <SectionHeader iconName="Scale" num="20" title={t("sec.comparisons.title")} subtitle={t("sec.comparisons.sub")} />
                <div className="space-y-3">
                  {sheet.comparisons.map((c, i) => (
                    <div key={i} className="rounded-md border border-border bg-card p-4">
                      <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                        vs <span style={{ color: "var(--primary)" }}>{c.vs}</span>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <div className="text-[11px] font-mono uppercase tracking-wider mb-1" style={{ color: "var(--accent)" }}>
                            <Check className="inline h-3 w-3 mr-1" />
                            {sheet.name}
                          </div>
                          <p className="text-[13px] text-muted-foreground leading-relaxed">{c.whenThis}</p>
                        </div>
                        <div>
                          <div className="text-[11px] font-mono uppercase tracking-wider mb-1 text-muted-foreground">
                            <X className="inline h-3 w-3 mr-1" />
                            {c.vs}
                          </div>
                          <p className="text-[13px] text-muted-foreground leading-relaxed">{c.whenThat}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Footer nav */}
            <div className="mt-16 pt-8 border-t border-border flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={onNavigateHome}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("label.back")}
              </button>
              <div className="text-[11px] text-muted-foreground font-mono">
                cheat_sheet · {sheet.slug}
              </div>
            </div>
          </div>

          {/* ─── Sticky TOC with scroll-spy ───────────────────────────────── */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-1">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-3">
                {t("label.toc")}
              </div>
              <nav className="space-y-1 text-[13px]">
                {presentSections.map((def) => (
                  <a
                    key={def.id}
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      const el = document.querySelector(`[data-section-id="${def.num}"]`);
                      if (el) (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="block text-muted-foreground hover:text-foreground transition-colors font-mono py-0.5"
                    style={activeSection === def.num ? { color: "var(--primary)" } : undefined}
                  >
                    <span className="text-[10px] mr-2 opacity-60">§{def.num}</span>
                    {t(def.titleKey)}
                  </a>
                ))}
              </nav>
              <div className="mt-6 pt-4 border-t border-border text-[10px] text-muted-foreground font-mono space-y-1">
                <div>{t("kbd.search")}</div>
                <div>{t("kbd.theme")}</div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <div className="mt-auto">
        <DeveloperFooter />
      </div>
    </article>
  );
}
