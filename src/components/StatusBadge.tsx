"use client";

interface StatusBadgeProps {
  status: "approved" | "pending" | "flagged" | "rejected" | "reviewed";
  pulse?: boolean;
  size?: "sm" | "md";
}

const config: Record<string, { label: string; className: string }> = {
  approved: { label: "Approved",   className: "badge badge-approved"   },
  pending:  { label: "Pending",    className: "badge badge-pending"    },
  flagged:  { label: "Flagged",    className: "badge badge-flagged"   },
  rejected: { label: "Rejected",   className: "badge badge-rejected"  },
  reviewed: { label: "Reviewed",   className: "badge badge-approved"  },
};

export default function StatusBadge({ status, pulse, size = "md" }: StatusBadgeProps) {
  const { label, className } = config[status] ?? config.pending;
  return (
    <span className={className} style={size === "sm" ? { fontSize: 10, padding: "1px 7px" } : {}}>
      {status === "pending" && pulse && <span className="pulse-dot" />}
      {label}
    </span>
  );
}
