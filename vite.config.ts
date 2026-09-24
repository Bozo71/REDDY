// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

import { USLUGE_STRANICE } from "./src/usluge";

export default defineConfig({
  tanstackStart: {
    // Stranice usluga nisu linkovane sa početne, pa ih crawlLinks ne bi našao.
    // Bez ovoga bi Google na njima vidio prazan shell umjesto teksta.
    pages: [{ path: "/" }, ...USLUGE_STRANICE.map((u) => ({ path: u.putanja }))],

    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },

    // Statički build — sajt je u cjelosti klijentski (forma, localStorage,
    // Web3Forms), pa mu server nije potreban. Ovako ga svaki besplatni
    // hosting servira bez podešavanja, uz vercel.json za rute.
    //
    // Bez SPA maske: u njoj se „/" uvijek pretvara u prazan shell, pa bi
    // Google na početnoj vidio meta tagove bez ijedne riječi teksta.
    prerender: { enabled: true, crawlLinks: true },
  },
});
