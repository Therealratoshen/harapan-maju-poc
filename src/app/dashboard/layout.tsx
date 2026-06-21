"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

// Lucide-style inline SVG icons
const icons = {
  grid: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  receipt: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  stock: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    </svg>
  ),
  flag: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
      <line x1="4" y1="22" x2="4" y2="15"/>
    </svg>
  ),
  upload: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16"/>
      <line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
    </svg>
  ),
  telegram: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  ),
  home: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
};

const navItems = [
  { href: "/dashboard/summary",  label: "Dashboard",  icon: "grid"   },
  { href: "/dashboard/receipts", label: "Receipts",   icon: "receipt" },
  { href: "/dashboard/stock",    label: "Stock",       icon: "stock"   },
  { href: "/dashboard/flags",    label: "Flags",       icon: "flag"    },
  { href: "/dashboard/upload",   label: "Upload",      icon: "upload"  },
];

// Badge state — loaded from API
function useNavBadges() {
  const [pending, setPending] = useState(0);
  const [flagCount, setFlagCount] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch("/api/receipts?status=pending").then(r => r.json()).catch(() => ({ receipts: [] })),
      fetch("/api/dashboard/flags").then(r => r.json()).catch(() => ({ flags: [] })),
    ]).then(([rData, fData]) => {
      setPending(rData.receipts?.length ?? 0);
      setFlagCount(fData.flags?.filter((f: any) => !f.resolved).length ?? 0);
    });
  }, []);

  return { pending, flagCount };
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pending, flagCount } = useNavBadges();
  const totalBadge = pending + flagCount;

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          style={{ backdropFilter: "blur(2px)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className="fixed lg:static inset-y-0 left-0 z-40 flex flex-col shadow-2xl lg:shadow-none transition-transform duration-250"
        style={{
          width: 220,
          background: "var(--sidebar-bg)",
          borderRight: "1px solid var(--sidebar-border)",
          transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
        }}
      >
        {/* Brand */}
        <div style={{ padding: "20px 16px 18px", borderBottom: "1px solid var(--sidebar-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 34, height: 34,
              background: "linear-gradient(135deg, var(--accent) 0%, #0e7490 100%)",
              borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 2px 8px rgba(8,145,178,0.4)"
            }}>
              <span style={{ color: "white", fontWeight: 700, fontSize: 12 }}>HM</span>
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-inverse)", lineHeight: 1.2 }}>Harapan Maju</p>
              <p style={{ fontSize: 10, color: "var(--sidebar-text)", lineHeight: 1.2, marginTop: 1 }}>Receipt Intel</p>
            </div>
          </div>

          {/* Telegram status */}
          <div style={{
            marginTop: 10,
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 10px",
            background: "rgba(5,150,105,0.12)",
            borderRadius: 8,
            border: "1px solid rgba(5,150,105,0.2)"
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "#34d399",
              boxShadow: "0 0 6px #34d399",
              display: "inline-block",
              flexShrink: 0
            }} />
            <span style={{ color: "#6ee7b7", fontSize: 10, fontWeight: 500 }}>Telegram connected</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto" }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: "var(--sidebar-text)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 6px 8px" }}>Menu</p>
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard/summary" && pathname.startsWith(item.href));
            const badge =
              item.href === "/dashboard/flags" ? flagCount :
              item.href === "/dashboard/summary" ? totalBadge :
              null;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`nav-item ${active ? "active" : ""}`}
              >
                <span className="icon">{icons[item.icon as keyof typeof icons]}</span>
                {item.label}
                {badge != null && badge > 0 && (
                  <span className="badge">{badge > 99 ? "99+" : badge}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--sidebar-border)" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--sidebar-text)", textDecoration: "none", marginBottom: 6 }}>
            {icons.home} Home
          </Link>
          <p style={{ fontSize: 10, color: "var(--sidebar-text)", opacity: 0.5 }}>v1.0 — POC Build</p>
        </div>
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Mobile top bar */}
        <header style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 16px",
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          position: "sticky", top: 0, zIndex: 20
        }} className="lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "none", background: "var(--surface-alt)", cursor: "pointer" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, background: "var(--accent)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "white", fontWeight: 700, fontSize: 11 }}>HM</span>
            </div>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Harapan Maju</span>
          </div>
        </header>

        <main style={{ flex: 1, overflow: "auto" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
