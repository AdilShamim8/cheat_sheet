"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Hash-based router. The sandbox exposes only `/`, so we encode the current
 * "page" in the URL hash: `#/`, `#/languages/python`, `#/ml-ai/pytorch`, etc.
 * This preserves back/forward navigation semantics without requiring additional
 * Next.js routes.
 */
export type Route =
  | { kind: "home" }
  | { kind: "sheet"; category: string; slug: string };

function parseHash(): Route {
  if (typeof window === "undefined") return { kind: "home" };
  const h = window.location.hash.replace(/^#\/?/, "");
  if (!h || h === "" || h === "/") return { kind: "home" };
  const parts = h.split("/").filter(Boolean);
  if (parts.length >= 2) {
    return { kind: "sheet", category: parts[0], slug: parts[1] };
  }
  return { kind: "home" };
}

export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => parseHash());

  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash());
      // Scroll to top on any route change so the new page starts at the hero
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = useCallback((to: string) => {
    if (typeof window === "undefined") return;
    const target = to.startsWith("#") ? to : `#${to}`;
    if (window.location.hash === target) {
      // Force a re-render even if hash is identical
      setRoute(parseHash());
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    } else {
      window.location.hash = target;
    }
  }, []);

  return { route, navigate };
}

export function routeToPath(route: Route): string {
  if (route.kind === "home") return "#/";
  return `#/${route.category}/${route.slug}`;
}

export function sheetPath(category: string, slug: string): string {
  return `#/${category}/${slug}`;
}
