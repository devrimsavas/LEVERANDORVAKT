// Notifications as the API returns them (GET /api/notifications)
export type ChangeSeverity = "info" | "warning" | "critical";

export interface NotificationItem {
  id: string;
  readAt: string | null;
  createdAt: string;
  company: { orgNumber: string; name: string };
  change: {
    field: string;
    oldValue: unknown;
    newValue: unknown;
    severity: ChangeSeverity;
    detectedAt: string;
  };
}

export interface NotificationSummary {
  unreadCount: number;
  latest: NotificationItem[];
}

// Designsystemet colors for each severity
export const SEVERITY_COLOR = {
  critical: "danger",
  warning: "warning",
  info: "info",
} as const satisfies Record<ChangeSeverity, string>;
