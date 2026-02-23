import { useState, useEffect, useRef } from "react";
import { fetchNotifications, markNotificationRead, markAllNotificationsRead, subscribeToNotifications } from "./supabaseData.js";

export default function NotificationBell({ userId, onOpenAd }) {
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const unread = notifs.filter(n => !n.read).length;

  useEffect(() => {
    if (!userId) return;
    fetchNotifications().then(setNotifs);
    const unsub = subscribeToNotifications(userId, (newNotif) => {
      setNotifs(prev => [newNotif, ...prev]);
    });
    return unsub;
  }, [userId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleClick = async (notif) => {
    if (!notif.read) {
      await markNotificationRead(notif.id);
      setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
    }
    onOpenAd(notif.ad_id);
    setOpen(false);
  };

  const handleMarkAll = async () => {
    await markAllNotificationsRead();
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  };

  const timeAgo = (ts) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return mins + "m";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h";
    return Math.floor(hrs / 24) + "d";
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        className="btn btn-ghost btn-xs"
        style={{ position: "relative", padding: "6px 8px", fontSize: 16 }}
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: "absolute", top: 2, right: 2,
            width: 16, height: 16, borderRadius: "50%",
            background: "var(--red)", color: "#fff",
            fontSize: 9, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, marginTop: 6,
          width: 360, maxHeight: 420, overflow: "auto",
          background: "var(--bg-card)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
          zIndex: 1000,
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 14px 8px", borderBottom: "1px solid var(--border-light)",
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Notifications</span>
            {unread > 0 && (
              <button onClick={handleMarkAll} className="btn btn-ghost btn-xs" style={{ fontSize: 10.5, color: "var(--accent-light)" }}>
                Mark all read
              </button>
            )}
          </div>

          {notifs.length === 0 && (
            <div style={{ padding: "24px 14px", textAlign: "center", fontSize: 12.5, color: "var(--text-muted)" }}>
              No notifications yet
            </div>
          )}

          {notifs.map(n => (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              style={{
                padding: "10px 14px", cursor: "pointer",
                borderBottom: "1px solid var(--border-light)",
                background: n.read ? "transparent" : "var(--accent-bg)",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg-elevated)"}
              onMouseLeave={e => e.currentTarget.style.background = n.read ? "transparent" : "var(--accent-bg)"}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-light)" }}>{n.sender_name}</span>
                <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--fm)" }}>{timeAgo(n.created_at)}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4, marginBottom: 3 }}>
                {n.message}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                in <span style={{ fontWeight: 600, color: "var(--text-tertiary)" }}>{n.ad_name}</span>
              </div>
              {!n.read && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)" }} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
