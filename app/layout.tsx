import type { Metadata } from "next";
import { BV01_POSTER_URL } from "@/lib/bv01-model-asset";
import { DevSearchQaRestore } from "@/components/dev-search-qa-restore";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Search Workspace",
  description: "Configura perfiles, búsquedas y CV privados.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <head>
        <link rel="preload" href={BV01_POSTER_URL} as="image" type="image/webp" />
      </head>
      <body><DevSearchQaRestore />{children}</body>
    </html>
  );
}
