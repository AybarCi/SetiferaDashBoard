"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RefreshCw, Search, ShoppingBag } from "lucide-react";

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div>
          <div className="sidebar-brand">
            <span className="sidebar-brand-name">Setifera Sync</span>
            <span className="sidebar-brand-desc">WooCommerce XML Panel</span>
          </div>
          <nav className="sidebar-nav">
            <Link href="/" className={`sidebar-link ${pathname === "/" ? "active" : ""}`}>
              <RefreshCw size={18} />
              <span>Senkronizasyon</span>
            </Link>
            <Link href="/search" className={`sidebar-link ${pathname === "/search" ? "active" : ""}`}>
              <Search size={18} />
              <span>Ürün Sorgulama</span>
            </Link>
            <Link href="/orders" className={`sidebar-link ${pathname === "/orders" ? "active" : ""}`}>
              <ShoppingBag size={18} />
              <span>Siparişler & Analizler</span>
            </Link>
          </nav>
        </div>
        <div className="sidebar-footer">
          <span>v1.2.0 • Setifera © 2026</span>
        </div>
      </aside>
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
