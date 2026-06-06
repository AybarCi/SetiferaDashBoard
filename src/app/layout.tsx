import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Setifera WooCommerce XML Sync Dashboard",
  description: "XML ürün entegrasyonu ve WooCommerce senkronizasyon kontrol paneli.",
};

import { AppProvider } from "../context/AppContext";
import SidebarLayout from "../components/SidebarLayout";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <AppProvider>
          <SidebarLayout>
            {children}
          </SidebarLayout>
        </AppProvider>
      </body>
    </html>
  );
}
