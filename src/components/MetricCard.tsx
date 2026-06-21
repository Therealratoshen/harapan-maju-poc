"use client";

interface MetricCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  trend?: { direction: "up" | "down" | "neutral"; value: string };
  accent?: "revenue" | "cogs" | "profit" | "warning" | "accent" | "danger" | "neutral";
  pulse?: boolean;
  icon?: React.ReactNode;
  style?: React.CSSProperties;
}

const accentMap = {
  revenue:  { border: "var(--revenue)",   value: "var(--revenue)",   label: "var(--text-secondary)" },
  cogs:     { border: "var(--cogs)",      value: "var(--text)",       label: "var(--text-secondary)" },
  profit:   { border: "var(--profit)",    value: "var(--profit)",     label: "var(--profit)"         },
  warning:  { border: "var(--warning)",   value: "var(--warning)",    label: "var(--warning)"         },
  accent:   { border: "var(--accent)",    value: "var(--accent)",     label: "var(--text-secondary)"  },
  danger:   { border: "var(--danger)",    value: "var(--danger)",     label: "var(--danger)"          },
  neutral:  { border: "var(--cogs)",      value: "var(--text)",       label: "var(--text-secondary)"  },
};

export default function MetricCard({
  label, value, sublabel, trend, accent = "neutral", pulse, icon, style
}: MetricCardProps) {
  const colors = accentMap[accent];

  return (
    <div
      className="card-flat"
      style={{
        borderTop: `3px solid ${colors.border}`,
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: colors.label, marginBottom: 8 }}>
          {label}
        </p>
        {icon && <span style={{ color: colors.value, opacity: 0.7 }}>{icon}</span>}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: sublabel || trend ? 4 : 0 }}>
        <span className="text-kpi" style={{ color: colors.value }}>
          {value}
        </span>
        {pulse && (
          <span className="pulse-dot" style={{ color: colors.value }} />
        )}
      </div>

      {sublabel && (
        <p style={{ fontSize: 11, color: colors.label, opacity: 0.75, marginBottom: trend ? 4 : 0 }}>
          {sublabel}
        </p>
      )}

      {trend && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 3,
          padding: "2px 7px",
          borderRadius: 10,
          background: trend.direction === "up" ? "rgba(5,150,105,0.08)" : trend.direction === "down" ? "rgba(220,38,38,0.08)" : "var(--surface-alt)",
          fontSize: 10, fontWeight: 600,
          color: trend.direction === "up" ? "var(--profit)" : trend.direction === "down" ? "var(--danger)" : "var(--text-secondary)",
        }}>
          {trend.direction === "up" ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>
          ) : trend.direction === "down" ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          ) : null}
          {trend.value}
        </div>
      )}
    </div>
  );
}
