// ─────────────────────────────────────────────────────────────────────────────
// Content registry — single source of truth for all cheat sheet entries.
// Adding a page: create a new file in /src/content/<category>/<slug>.ts
// exporting a `CheatSheet`, then import + register it below.
// ─────────────────────────────────────────────────────────────────────────────

import type { CheatSheet } from "@/lib/types";

// Tier 1 — Core languages
import python from "@/content/languages/python";
import javascript from "@/content/languages/javascript";
import typescript from "@/content/languages/typescript";
import cpp from "@/content/languages/cpp";
import c from "@/content/languages/c";
import java from "@/content/languages/java";
import csharp from "@/content/languages/csharp";
import go from "@/content/languages/go";
import rust from "@/content/languages/rust";

// Tier 2 — Domain-specific
import ruby from "@/content/languages/ruby";
import php from "@/content/languages/php";
import swift from "@/content/languages/swift";
import kotlin from "@/content/languages/kotlin";
import dart from "@/content/languages/dart";
import rlang from "@/content/languages/r";
import sql from "@/content/languages/sql";
import bash from "@/content/languages/bash";
import scala from "@/content/languages/scala";

// Tier 3 — Specialized / legacy
import objectiveC from "@/content/languages/objective-c";
import perl from "@/content/languages/perl";
import lua from "@/content/languages/lua";
import julia from "@/content/languages/julia";
import matlab from "@/content/languages/matlab";
import haskell from "@/content/languages/haskell";
import elixir from "@/content/languages/elixir";
import clojure from "@/content/languages/clojure";
import assembly from "@/content/languages/assembly";
import fortran from "@/content/languages/fortran";
import vba from "@/content/languages/vba";

// ML / AI frameworks
import pytorch from "@/content/ml-ai/pytorch";
import tensorflow from "@/content/ml-ai/tensorflow";
import keras from "@/content/ml-ai/keras";
import scikitLearn from "@/content/ml-ai/scikit-learn";

// Systems & architecture
import systemDesign from "@/content/systems/system-design";

// Topics hub
import git from "@/content/topics/git";
import docker from "@/content/topics/docker";
import linux from "@/content/topics/linux";
import networking from "@/content/topics/networking";
import devops from "@/content/topics/devops";

export const ALL_SHEETS: CheatSheet[] = [
  // Tier 1
  python, javascript, typescript, cpp, c, java, csharp, go, rust,
  // Tier 2
  ruby, php, swift, kotlin, dart, rlang, sql, bash, scala,
  // Tier 3
  objectiveC, perl, lua, julia, matlab, haskell, elixir, clojure, assembly, fortran, vba,
  // ML / AI
  pytorch, tensorflow, keras, scikitLearn,
  // Systems
  systemDesign,
  // Topics
  git, docker, linux, networking, devops,
];

export const SHEETS_BY_SLUG: Record<string, CheatSheet> = Object.fromEntries(
  ALL_SHEETS.map((s) => [s.slug, s]),
);

export function getSheet(slug: string): CheatSheet | undefined {
  return SHEETS_BY_SLUG[slug];
}

export function sheetsByCategory(): Record<string, CheatSheet[]> {
  const out: Record<string, CheatSheet[]> = {};
  for (const s of ALL_SHEETS) {
    (out[s.category] ||= []).push(s);
  }
  return out;
}
