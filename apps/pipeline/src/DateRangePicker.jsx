import { useState, useEffect, useRef } from "react";

export default function DateRangePicker({ dateFrom, dateTo, onChange }) {
  const [open, setOpen] = useState(false);
  const [selStart, setSelStart] = useState(null);
  const [selEnd, setSelEnd] = useState(null);
  const [hovDate, setHovDate] = useState(null);
  const [viewDate, setViewDate] = useState(() => new Date());
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  useEffect(() => {
    if (open) { setSelStart(dateFrom || null); setSelEnd(dateTo || null); }
  }, [open]);

  const fmt = (d) => { if (!d) return ""; const dt = new Date(d + "T00:00:00"); return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
  const toStr = (d) => { const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const dy = String(d.getDate()).padStart(2, "0"); return `${y}-${m}-${dy}`; };
  const today = toStr(new Date());
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return toStr(d); })();
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return toStr(d); };
  const monthStart = (offset = 0) => { const d = new Date(); d.setMonth(d.getMonth() - offset, 1); return toStr(d); };
  const monthEnd = (offset = 0) => { const d = new Date(); d.setMonth(d.getMonth() - offset + 1, 0); return toStr(d); };

  const PRESETS = [
    { label: "Today", from: today, to: today },
    { label: "Yesterday", from: yesterday, to: yesterday },
    { label: "Last 7 Days", from: daysAgo(6), to: today },
    { label: "Last 14 Days", from: daysAgo(13), to: today },
    { label: "Last 30 Days", from: daysAgo(29), to: today },
    { label: "Last 90 Days", from: daysAgo(89), to: today },
    { label: "Last 365 Days", from: daysAgo(364), to: today },
    { label: "Last Month", from: monthStart(1), to: monthEnd(1) },
    { label: "This Month", from: monthStart(0), to: today },
  ];

  const activePreset = PRESETS.find(p => p.from === dateFrom && p.to === dateTo);

  const label = activePreset ? activePreset.label
    : (dateFrom && dateTo) ? `${fmt(dateFrom)} – ${fmt(dateTo)}`
    : (dateFrom) ? `From ${fmt(dateFrom)}`
    : (dateTo) ? `Until ${fmt(dateTo)}`
    : "All Time";

  const applyPreset = (p) => { onChange(p.from, p.to); setOpen(false); };
  const apply = () => {
    if (selStart && selEnd) { const [a, b] = selStart <= selEnd ? [selStart, selEnd] : [selEnd, selStart]; onChange(a, b); }
    else if (selStart) onChange(selStart, selStart);
    setOpen(false);
  };
  const clear = () => { onChange("", ""); setOpen(false); };

  const calDays = () => {
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
    const startDow = first.getDay();
    const days = [];
    for (let i = 0; i < startDow; i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) days.push(toStr(new Date(y, m, d)));
    return days;
  };

  const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));

  const onDayClick = (d) => {
    if (!selStart || (selStart && selEnd)) { setSelStart(d); setSelEnd(null); }
    else { setSelEnd(d); }
  };

  const inRange = (d) => {
    if (!d) return false;
    const s = selStart, e = selEnd || hovDate;
    if (!s || !e) return d === s;
    const [a, b] = s <= e ? [s, e] : [e, s];
    return d >= a && d <= b;
  };
  const isStart = (d) => d && d === selStart;
  const isEnd = (d) => d && d === (selEnd || hovDate);

  const monthLabel = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(!open)} className="btn btn-ghost btn-sm" style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", fontSize: 12, border: "1px solid var(--border-light)", borderRadius: 8 }}>
        <span style={{ fontSize: 13 }}>📅</span> {label} <span style={{ fontSize: 10, opacity: 0.5 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 1000, marginTop: 4, background: "var(--bg-modal)", border: "1px solid var(--border-light)", borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.4)", display: "flex", minWidth: 520, overflow: "hidden" }}>
          {/* Presets */}
          <div style={{ width: 160, borderRight: "1px solid var(--border-light)", padding: "8px 0", overflowY: "auto", maxHeight: 360 }}>
            {PRESETS.map(p => (
              <div key={p.label} onClick={() => { setSelStart(p.from); setSelEnd(p.to); applyPreset(p); }}
                style={{ padding: "8px 14px", fontSize: 12, cursor: "pointer", color: activePreset?.label === p.label ? "var(--accent-light)" : "var(--text-secondary)", background: activePreset?.label === p.label ? "var(--accent-bg)" : "transparent", fontWeight: activePreset?.label === p.label ? 600 : 400, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                onMouseEnter={e => e.currentTarget.style.background = activePreset?.label === p.label ? "var(--accent-bg)" : "var(--bg-elevated)"}
                onMouseLeave={e => e.currentTarget.style.background = activePreset?.label === p.label ? "var(--accent-bg)" : "transparent"}>
                {p.label}
                {activePreset?.label === p.label && <span style={{ color: "var(--accent-light)" }}>✓</span>}
              </div>
            ))}
          </div>
          {/* Calendar */}
          <div style={{ flex: 1, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <button onClick={prevMonth} className="btn btn-ghost btn-xs" style={{ fontSize: 14 }}>←</button>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-light)" }}>{monthLabel}</span>
              <button onClick={nextMonth} className="btn btn-ghost btn-xs" style={{ fontSize: 14 }}>→</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 0, textAlign: "center" }}>
              {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
                <div key={d} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", padding: "4px 0" }}>{d}</div>
              ))}
              {calDays().map((d, i) => {
                if (!d) return <div key={`e${i}`} />;
                const dayNum = new Date(d + "T00:00:00").getDate();
                const range = inRange(d);
                const start = isStart(d);
                const end = isEnd(d);
                const isToday = d === today;
                return (
                  <div key={d} onClick={() => onDayClick(d)} onMouseEnter={() => setHovDate(d)} onMouseLeave={() => setHovDate(null)}
                    style={{ padding: "6px 0", fontSize: 12, cursor: "pointer", borderRadius: start ? "6px 0 0 6px" : end ? "0 6px 6px 0" : 0,
                      background: (start || end) ? "var(--accent)" : range ? "var(--accent-bg)" : "transparent",
                      color: (start || end) ? "#fff" : isToday ? "var(--accent-light)" : range ? "var(--accent-light)" : "var(--text-secondary)",
                      fontWeight: (start || end || isToday) ? 700 : 400 }}>
                    {dayNum}
                  </div>
                );
              })}
            </div>
            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border-light)" }}>
              <button onClick={clear} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>Clear</button>
              <button onClick={() => setOpen(false)} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>Cancel</button>
              <button onClick={apply} className="btn btn-primary btn-sm" style={{ fontSize: 11 }}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
