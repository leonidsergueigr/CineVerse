import type { Metadata } from "next";
import Script from "next/script";
import { CineVerseSplash } from "@/components/cineverse-splash";
import { InlineScript } from "@/components/inline-script";
import "./globals.css";

const DEV_EXTENSION_ATTRIBUTE_GUARD = String.raw`
(() => {
  const attributeName = "bis_skin_checked";

  const clean = (root) => {
    if (root?.nodeType === Node.ELEMENT_NODE) {
      root.removeAttribute(attributeName);
    }
    root?.querySelectorAll?.("[" + attributeName + "]").forEach((element) => {
      element.removeAttribute(attributeName);
    });
  };

  clean(document.documentElement);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        mutation.target.removeAttribute(attributeName);
        continue;
      }
      mutation.addedNodes.forEach(clean);
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [attributeName],
    childList: true,
    subtree: true,
  });

  window.addEventListener("load", () => {
    clean(document.documentElement);
    window.setTimeout(() => {
      clean(document.documentElement);
      observer.disconnect();
    }, 1000);
  }, { once: true });
})();
`;

const SPLASH_SESSION_GUARD = String.raw`
try {
  if (window.sessionStorage.getItem("cineverse:splash:v1") === "shown") {
    document.documentElement.dataset.cineverseSplash = "seen";
  }
} catch {}
`;

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.CINEVERSE_BASE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "CineVerse",
    template: "%s | CineVerse",
  },
  applicationName: "CineVerse",
  description:
    "Home cinema local avec catalogue TMDB, profils, suivi de lecture et recommandations personnalisees.",
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "CineVerse",
    title: "CineVerse",
    description: "Votre cinema. Vos profils. Vos choix.",
  },
  twitter: {
    card: "summary_large_image",
    title: "CineVerse",
    description: "Votre cinema. Vos profils. Vos choix.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        <InlineScript html={SPLASH_SESSION_GUARD} />
        {process.env.NODE_ENV === "development" ? (
          <Script id="dev-extension-attribute-guard" strategy="beforeInteractive">
            {DEV_EXTENSION_ATTRIBUTE_GUARD}
          </Script>
        ) : null}
        <CineVerseSplash />
        {children}
      </body>
    </html>
  );
}
