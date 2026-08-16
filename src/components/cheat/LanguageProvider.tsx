"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import { LANGUAGES, t as translate, type LanguageCode } from "@/lib/i18n";

const STORAGE_KEY = "cs-lang";

function readInitialLang(): LanguageCode {
  if (typeof document === "undefined") return "en";
  const stored = localStorage.getItem(STORAGE_KEY) as LanguageCode | null;
  if (stored && LANGUAGES.some((l) => l.code === stored)) return stored;
  const nav = navigator.language?.slice(0, 2).toLowerCase() as LanguageCode;
  if (nav && LANGUAGES.some((l) => l.code === nav)) return nav;
  return "en";
}

type Ctx = {
  lang: LanguageCode;
  setLang: (code: LanguageCode) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<Ctx>({
  lang: "en",
  setLang: () => {},
  t: (k) => k,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LanguageCode>(readInitialLang);

  const setLang = useCallback((code: LanguageCode) => {
    setLangState(code);
    try { localStorage.setItem(STORAGE_KEY, code); } catch {}
    const meta = LANGUAGES.find((l) => l.code === code);
    if (meta) {
      document.documentElement.lang = code;
      document.documentElement.dir = meta.dir;
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(lang, key, params),
    [lang],
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const { lang, setLang } = useContext(LanguageContext);
  return { lang, setLang, languages: LANGUAGES };
}

export function useT() {
  return useContext(LanguageContext);
}
