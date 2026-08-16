"use client";

import { useHashRoute } from "@/hooks/use-hash-route";
import { getSheet } from "@/lib/registry";
import { Navbar } from "@/components/cheat/Navbar";
import { HubView, focusHubSearch } from "@/components/cheat/HubView";
import { SheetView } from "@/components/cheat/SheetView";
import { ParticleHero } from "@/components/cheat/ParticleHero";
import { LanguageProvider } from "@/components/cheat/LanguageProvider";

export default function Home() {
  const { route, navigate } = useHashRoute();

  const goHome = () => navigate("#/");

  return (
    <LanguageProvider>
      <div className="min-h-screen flex flex-col">
        <Navbar
          onNavigateHome={goHome}
          onSearchFocus={focusHubSearch}
        />

        {route.kind === "sheet" ? (
          (() => {
            const sheet = getSheet(route.slug);
            if (!sheet) {
              return (
                <div className="flex-1 flex items-center justify-center px-5 py-24">
                  <div className="text-center">
                    <div className="text-6xl mb-4 opacity-30 font-mono">404</div>
                    <h1 className="text-xl font-semibold mb-2">Reference not found</h1>
                    <p className="text-muted-foreground mb-6">
                      No entry for <code className="font-mono">/{route.category}/{route.slug}</code>.
                    </p>
                    <button
                      onClick={goHome}
                      className="inline-flex items-center px-4 py-2 rounded-md border border-border hover:border-primary/40 transition-colors text-sm font-mono"
                    >
                      ← back to index
                    </button>
                  </div>
                </div>
              );
            }
            return <SheetView sheet={sheet} onNavigateHome={goHome} />;
          })()
        ) : (
          <div className="relative flex-1">
            <div className="absolute top-0 left-0 right-0 h-[420px] pointer-events-none" aria-hidden>
              <ParticleHero />
            </div>
            <HubView onNavigate={navigate} />
          </div>
        )}
      </div>
    </LanguageProvider>
  );
}
