"use client";

import { useRouter } from "next/navigation";

const TYPE_ICONS = {
  CAMPAIGN_UPDATE: "📣",
  STATUS_CHANGE:   "🔄",
  TASK_OVERDUE:    "⏰",
  UPLOAD_COMPLETE: "✅",
  REVIEW_FLAGGED:  "🚩",
  DEAL_UPDATE:     "💼",
  SYSTEM:          "⚙️",
};

function relativeTime(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationFeed({ notifications, loading, onMarkAllRead, onMarkOneRead }) {
  const router = useRouter();
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  function handleItemClick(notification) {
    if (!notification.isRead) {
      onMarkOneRead(notification.id);
    }
    if (notification.link) {
      router.push(notification.link);
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        right: 0,
        width: 360,
        background: "var(--ms-surface)",
        border: "1px solid var(--ms-border)",
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.24), 0 2px 8px rgba(0,0,0,0.12)",
        zIndex: 200,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid var(--ms-border)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ms-text)" }}>
          Notifications
          {unreadCount > 0 && (
            <span
              style={{
                marginLeft: 8,
                background: "var(--ms-accent)",
                color: "var(--ms-bg)",
                borderRadius: 99,
                fontSize: 11,
                fontWeight: 700,
                padding: "1px 7px",
              }}
            >
              {unreadCount}
            </span>
          )}
        </span>
        {unreadCount > 0 && (
          <button
            onClick={onMarkAllRead}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              color: "var(--ms-accent)",
              fontWeight: 600,
              padding: "2px 4px",
              borderRadius: 4,
            }}
          >
            Mark all read
          </button>
        )}
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", maxHeight: 400 }}>
        {loading && notifications.length === 0 ? (
          <div
            style={{
              padding: "32px 16px",
              textAlign: "center",
              color: "var(--ms-text3)",
              fontSize: 13,
            }}
          >
            Loading…
          </div>
        ) : notifications.length === 0 ? (
          <div
            style={{
              padding: "40px 16px",
              textAlign: "center",
              color: "var(--ms-text3)",
              fontSize: 13,
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
            No notifications yet
          </div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => handleItemClick(n)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                width: "100%",
                padding: "10px 16px",
                background: n.isRead ? "transparent" : "color-mix(in srgb, var(--ms-accent) 6%, transparent)",
                border: "none",
                borderBottom: "1px solid var(--ms-border)",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "color-mix(in srgb, var(--ms-accent) 10%, transparent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = n.isRead
                  ? "transparent"
                  : "color-mix(in srgb, var(--ms-accent) 6%, transparent)";
              }}
            >
              {/* Type icon */}
              <span style={{ fontSize: 18, flexShrink: 0, lineHeight: "22px" }}>
                {TYPE_ICONS[n.type] || "🔔"}
              </span>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: n.isRead ? 400 : 700,
                    color: "var(--ms-text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {n.title}
                </div>
                {n.body && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--ms-text2)",
                      marginTop: 2,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {n.body}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "var(--ms-text3)", marginTop: 4 }}>
                  {relativeTime(n.createdAt)}
                </div>
              </div>

              {/* Unread dot */}
              {!n.isRead && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--ms-accent)",
                    flexShrink: 0,
                    marginTop: 6,
                  }}
                />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
