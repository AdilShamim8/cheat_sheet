"use client";

import React, { useState } from "react";
import { highlight } from "@/lib/highlight";
import { Check, Copy } from "lucide-react";

interface CodeBlockProps {
  code: string;
  lang?: string;
  caption?: string;
  className?: string;
}

export function CodeBlock({ code, lang, caption, className = "" }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <figure className={`my-3 sm:my-4 ${className}`}>
      {caption && (
        <figcaption className="text-[11px] sm:text-xs text-muted-foreground mb-1.5 font-mono tracking-wide break-words">
          {caption}
        </figcaption>
      )}
      <div className="relative group">
        <pre
          className="cheat-code overflow-x-auto p-3 sm:p-4 text-[12px] sm:text-[13px] leading-relaxed"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <code className="font-mono">{highlight(code, lang)}</code>
        </pre>
        <button
          onClick={onCopy}
          aria-label="Copy code"
          className="absolute top-2 right-2 p-1.5 rounded-md bg-background/60 border border-border opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-background"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
          ) : (
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      </div>
    </figure>
  );
}
