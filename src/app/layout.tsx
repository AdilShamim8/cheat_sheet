import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "cheat_sheet — Premium Developer Reference",
  description:
    "A premium, fast-loading reference platform covering programming languages, ML/AI frameworks, systems, and core engineering topics. Built for engineers who need fast, high-quality recall — not tutorials.",
  keywords: [
    "programming", "cheat sheet", "reference", "developer",
    "Python", "JavaScript", "TypeScript", "Rust", "Go", "Java", "C++",
    "PyTorch", "TensorFlow", "system design", "Git", "Docker", "Linux",
  ],
  authors: [{ name: "Adil Shamim", url: "https://www.adilshamim.me/" }],
  icons: { icon: "/logo.svg" },
  openGraph: {
    title: "cheat_sheet — Premium Developer Reference",
    description:
      "Maximum signal, minimum noise. The 20% of knowledge that resolves 80% of real-world usage, distilled for working engineers.",
    siteName: "cheat_sheet",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "cheat_sheet — Premium Developer Reference",
    description: "Maximum signal, minimum noise for working engineers.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
              var t=localStorage.getItem('cs-theme')||'black-hole';
              document.documentElement.setAttribute('data-theme',t);
              if(t==='black-hole')document.documentElement.classList.add('dark');
              var l=localStorage.getItem('cs-lang')||'en';
              document.documentElement.lang=l;
              if(l==='ar')document.documentElement.dir='rtl';
            }catch(e){document.documentElement.setAttribute('data-theme','black-hole');document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen flex flex-col`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
