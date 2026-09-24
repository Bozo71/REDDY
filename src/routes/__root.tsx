import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── SEO ───────────────────────────────────────────────────────────────────
   Sve na jednom mjestu, da se mijenja bez traženja po fajlu. */
const SAJT = "https://thereddy.me";
const TELEFON_PRIKAZ = "069 600 628";
const TELEFON_E164 = "+38269600628";
const NASLOV = "Majstor Podgorica – vodoinstalater, električar, moler | Reddy";
const OPIS =
  `Kvar u stanu? Reddy šalje provjerenog majstora u Podgorici i odgovara za posao do kraja. Pozovite ${TELEFON_PRIKAZ}.`;

/* ── Mjerenje posjeta ──────────────────────────────────────────────────────
   Google Analytics i Meta Pixel. Vrijede za sve stranice jer stoje u root ruti. */
const GA_ID = "G-61ZNF9ZP4H";
const META_PIXEL_ID = "1470513724898057";

// Google čita ovo da bi znao ko smo, gdje radimo i šta radimo.
const PODACI_O_FIRMI = {
  "@context": "https://schema.org",
  "@type": "HomeAndConstructionBusiness",
  name: "Reddy",
  url: SAJT,
  telephone: TELEFON_E164,
  email: "info@thereddy.me",
  image: `${SAJT}/og-image.jpg`,
  priceRange: "$$",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Podgorica",
    addressCountry: "ME",
  },
  areaServed: {
    "@type": "City",
    name: "Podgorica",
  },
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      opens: "08:00",
      closes: "20:00",
    },
  ],
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Usluge",
    itemListElement: [
      "Vodoinstalaterski radovi",
      "Električarski radovi",
      "Molerski radovi",
      "Fasaderski radovi",
      "Keramičarski radovi",
      "Klima uređaji i grijanje",
      "Bravarske usluge",
      "Video nadzor i alarmni sistemi",
    ].map((usluga) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: usluga },
    })),
  },
};

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: NASLOV },
      { name: "description", content: OPIS },
      { name: "author", content: "Reddy" },

      // Open Graph — ovo se vidi kad se link podijeli na WhatsApp, Viber, Facebook.
      { property: "og:title", content: NASLOV },
      { property: "og:description", content: OPIS },
      { property: "og:image", content: `${SAJT}/og-image.jpg` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:url", content: SAJT },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "sr_ME" },
      { property: "og:site_name", content: "Reddy" },

      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: NASLOV },
      { name: "twitter:description", content: OPIS },
      { name: "twitter:image", content: `${SAJT}/og-image.jpg` },
    ],
    links: [
      { rel: "canonical", href: SAJT },

      // Ikonice: .ico za starije pregledače i Windows prečice, PNG za sve ostalo.
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "icon", type: "image/png", sizes: "48x48", href: "/icon-48.png" },
      { rel: "icon", type: "image/png", sizes: "96x96", href: "/icon-96.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },

      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap",
      },
    ],
    scripts: [
      { src: `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`, async: true },
      {
        children: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`,
      },
      {
        children: `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`,
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(PODACI_O_FIRMI),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="sr-Latn-ME">
      <head>
        <HeadContent />
      </head>
      <body>
        {/* Meta Pixel za posjetioce bez JavaScripta — mora u body, slika u head nije validna. */}
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            alt=""
            src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
          />
        </noscript>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
