import { useState, useEffect, useCallback, useRef } from "react";
import { fetchStrategyData, upsertStrategyData, subscribeToStrategy } from "./supabaseData.js";
import ProductIntelligence from "./ProductIntelligence.jsx";

const TABS = [
  { id: "brand", icon: "🧭", label: "Brand" },
  { id: "avatars", icon: "👩‍👧", label: "Avatars" },
  { id: "desires", icon: "🌟", label: "Desires" },
  { id: "triggers", icon: "💣", label: "Triggers" },
  { id: "fears", icon: "😨", label: "Fears" },
  { id: "problem", icon: "🧠", label: "Problem & Solution" },
  { id: "headlines", icon: "📰", label: "Headlines" },
  { id: "market", icon: "🎯", label: "Market" },
  { id: "product", icon: "🎒", label: "Product" },
  { id: "objections", icon: "⚠️", label: "Objections" },
  { id: "adslab", icon: "🧪", label: "Ads Lab" },
  { id: "ai", icon: "🤖", label: "AI Research" },
];

// ════════════════════════════════════════════════
// AUTOSAVE HOOK
// ════════════════════════════════════════════════

function useAutoSave(workspaceId, section, data) {
  const timer = useRef(null);
  const save = useCallback(() => {
    if (!workspaceId || data === null || data === undefined) return;
    upsertStrategyData(workspaceId, section, data).catch(e => console.error("Strategy save error:", e));
  }, [workspaceId, section, data]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 1200);
    return () => clearTimeout(timer.current);
  }, [save]);
}

// ════════════════════════════════════════════════
// EDITABLE CELL
// ════════════════════════════════════════════════

function Cell({ value, onChange, placeholder, multiline, style }) {
  if (multiline) {
    return (
      <textarea
        className="input"
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ minHeight: 60, resize: "vertical", fontSize: 12, ...style }}
      />
    );
  }
  return (
    <input
      className="input"
      value={value || ""}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ fontSize: 12, ...style }}
    />
  );
}

// ════════════════════════════════════════════════
// TAB: BRAND OVERVIEW
// ════════════════════════════════════════════════

function BrandTab({ data, onChange, workspaceId }) {
  const d = data || {};
  useAutoSave(workspaceId, "brand_info", data);

  const set = (k, v) => onChange({ ...d, [k]: v });

  const fields = [
    { key: "brand_name", label: "Brand Name" },
    { key: "website", label: "Brand Website" },
    { key: "facebook", label: "Facebook Page" },
    { key: "instagram", label: "Instagram Page" },
    { key: "tiktok", label: "TikTok Page" },
    { key: "ad_account_id", label: "Ad Account ID" },
  ];

  return (
    <div>
      <div className="section-title">Brand Overview</div>
      <div style={{ display: "grid", gap: 12, maxWidth: 500 }}>
        {fields.map(f => (
          <div key={f.key}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>{f.label}</label>
            <Cell value={d[f.key]} onChange={v => set(f.key, v)} placeholder={f.label} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// TAB: AVATARS
// ════════════════════════════════════════════════

function AvatarsTab({ data, onChange, workspaceId }) {
  const items = data || [];
  useAutoSave(workspaceId, "avatars", data);

  const add = () => onChange([...items, { name: "", raw_research: "", clean_insight: "", category_insights: "", awareness_level: "" }]);
  const remove = (i) => onChange(items.filter((_, j) => j !== i));
  const set = (i, k, v) => { const n = [...items]; n[i] = { ...n[i], [k]: v }; onChange(n); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="section-title" style={{ margin: 0 }}>Customer Avatars</div>
        <button onClick={add} className="btn btn-primary btn-sm">+ Add Avatar</button>
      </div>
      {items.length === 0 && <div className="empty-state">No avatars yet. Add your first customer avatar.</div>}
      {items.map((a, i) => (
        <div key={i} className="card-flat" style={{ padding: 14, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: "var(--radius-full)", background: "var(--accent-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "var(--accent-light)" }}>
                {i + 1}
              </div>
              <Cell value={a.name} onChange={v => set(i, "name", v)} placeholder="Avatar name / description" style={{ fontWeight: 600, flex: 1, minWidth: 300 }} />
            </div>
            <button onClick={() => remove(i)} className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }}>Remove</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>Raw Research</label>
              <Cell value={a.raw_research} onChange={v => set(i, "raw_research", v)} placeholder="Link or notes to raw research..." multiline />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>Clean Insight Document</label>
              <Cell value={a.clean_insight} onChange={v => set(i, "clean_insight", v)} placeholder="Link or summary..." multiline />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>Category Insights Document</label>
              <Cell value={a.category_insights} onChange={v => set(i, "category_insights", v)} placeholder="Link or summary..." multiline />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>Level of Awareness</label>
              <select className="input" value={a.awareness_level || ""} onChange={e => set(i, "awareness_level", e.target.value)} style={{ fontSize: 12 }}>
                <option value="">Select...</option>
                <option value="unaware">Unaware</option>
                <option value="problem_aware">Problem Aware</option>
                <option value="solution_aware">Solution Aware</option>
                <option value="product_aware">Product Aware</option>
                <option value="most_aware">Most Aware</option>
              </select>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════
// TAB: DESIRES
// ════════════════════════════════════════════════

function DesiresTab({ data, onChange, workspaceId }) {
  const items = data || [];
  useAutoSave(workspaceId, "desires", data);

  const add = () => onChange([...items, { want: "", so_1: "", so_2: "", core: "", quote_1: "", quote_2: "", quote_3: "" }]);
  const remove = (i) => onChange(items.filter((_, j) => j !== i));
  const set = (i, k, v) => { const n = [...items]; n[i] = { ...n[i], [k]: v }; onChange(n); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="section-title" style={{ margin: 0 }}>Avatar Desires</div>
        <button onClick={add} className="btn btn-primary btn-sm">+ Add Desire</button>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Map each desire through layers: "I want to..." → "So I can..." → Deepest Core Desire, with raw customer quotes.</div>
      {items.length === 0 && <div className="empty-state">No desires yet.</div>}
      {items.map((d, i) => (
        <div key={i} className="card-flat" style={{ padding: 14, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-light)" }}>Desire {i + 1}</span>
            <button onClick={() => remove(i)} className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }}>Remove</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div><label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>"I want to..."</label><Cell value={d.want} onChange={v => set(i, "want", v)} placeholder="Primary desire" multiline /></div>
            <div><label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>"So I can..."</label><Cell value={d.so_1} onChange={v => set(i, "so_1", v)} placeholder="First layer" multiline /></div>
            <div><label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>"So I can..."</label><Cell value={d.so_2} onChange={v => set(i, "so_2", v)} placeholder="Second layer" multiline /></div>
            <div><label style={{ fontSize: 10, fontWeight: 600, color: "var(--green)" }}>Deepest Core</label><Cell value={d.core} onChange={v => set(i, "core", v)} placeholder="Core emotional desire" multiline /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div><label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>Raw Quote 1</label><Cell value={d.quote_1} onChange={v => set(i, "quote_1", v)} placeholder='"Quote..."' multiline /></div>
            <div><label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>Raw Quote 2</label><Cell value={d.quote_2} onChange={v => set(i, "quote_2", v)} placeholder='"Quote..."' multiline /></div>
            <div><label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>Raw Quote 3</label><Cell value={d.quote_3} onChange={v => set(i, "quote_3", v)} placeholder='"Quote..."' multiline /></div>
          </div>
        </div>
      ))}
      {items.length > 0 && (
        <div className="card-flat" style={{ padding: 14, borderLeft: "3px solid var(--green)" }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: "var(--green)" }}>CORE DESIRE (Summary)</label>
          <Cell
            value={items[items.length - 1]?.core_summary || ""}
            onChange={v => { const n = [...items]; n[n.length - 1] = { ...n[n.length - 1], core_summary: v }; onChange(n); }}
            placeholder="The single overarching core desire across all avatars..."
            multiline
          />
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════
// TAB: EMOTIONAL TRIGGERS
// ════════════════════════════════════════════════

function TriggersTab({ data, onChange, workspaceId }) {
  const items = data || [];
  useAutoSave(workspaceId, "emotional_triggers", data);

  const add = () => onChange([...items, { trigger: "", quote_1: "", quote_2: "", quote_3: "" }]);
  const remove = (i) => onChange(items.filter((_, j) => j !== i));
  const set = (i, k, v) => { const n = [...items]; n[i] = { ...n[i], [k]: v }; onChange(n); };

  const presets = ["Identity Loss", "Shame", "Hopelessness", "Grief", "Fear", "Insecurity", "Exhaustion", "Envy"];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="section-title" style={{ margin: 0 }}>Emotional Triggers</div>
        <div style={{ display: "flex", gap: 4 }}>
          {items.length === 0 && <button onClick={() => onChange(presets.map(t => ({ trigger: t, quote_1: "", quote_2: "", quote_3: "" })))} className="btn btn-ghost btn-sm">Load Presets</button>}
          <button onClick={add} className="btn btn-primary btn-sm">+ Add Trigger</button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Emotional triggers are specific feelings that spark strong reactions. Document them with real customer quotes.</div>
      {items.length === 0 && <div className="empty-state">No triggers yet. Click "Load Presets" for common triggers or add your own.</div>}
      {items.map((t, i) => (
        <div key={i} className="card-flat" style={{ padding: 14, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Cell value={t.trigger} onChange={v => set(i, "trigger", v)} placeholder="Trigger name" style={{ fontWeight: 700, maxWidth: 250 }} />
            <button onClick={() => remove(i)} className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }}>Remove</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div><label style={{ fontSize: 10, color: "var(--text-muted)" }}>Quote 1</label><Cell value={t.quote_1} onChange={v => set(i, "quote_1", v)} placeholder='"Quote..."' multiline /></div>
            <div><label style={{ fontSize: 10, color: "var(--text-muted)" }}>Quote 2</label><Cell value={t.quote_2} onChange={v => set(i, "quote_2", v)} placeholder='"Quote..."' multiline /></div>
            <div><label style={{ fontSize: 10, color: "var(--text-muted)" }}>Quote 3</label><Cell value={t.quote_3} onChange={v => set(i, "quote_3", v)} placeholder='"Quote..."' multiline /></div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════
// TAB: FEARS
// ════════════════════════════════════════════════

function FearsTab({ data, onChange, workspaceId }) {
  const items = data || [];
  useAutoSave(workspaceId, "fears", data);

  const add = () => onChange([...items, { fear: "", quote_1: "", quote_2: "", quote_3: "" }]);
  const remove = (i) => onChange(items.filter((_, j) => j !== i));
  const set = (i, k, v) => { const n = [...items]; n[i] = { ...n[i], [k]: v }; onChange(n); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="section-title" style={{ margin: 0 }}>Avatar's Fears</div>
        <button onClick={add} className="btn btn-primary btn-sm">+ Add Fear</button>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Understanding your customer's deepest fears grabs attention and builds trust through empathy.</div>
      {items.length === 0 && <div className="empty-state">No fears documented yet.</div>}
      {items.map((f, i) => (
        <div key={i} className="card-flat" style={{ padding: 14, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Cell value={f.fear} onChange={v => set(i, "fear", v)} placeholder="Fear description" style={{ fontWeight: 700, maxWidth: 400 }} />
            <button onClick={() => remove(i)} className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }}>Remove</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div><label style={{ fontSize: 10, color: "var(--text-muted)" }}>Quote 1</label><Cell value={f.quote_1} onChange={v => set(i, "quote_1", v)} placeholder='"Quote..."' multiline /></div>
            <div><label style={{ fontSize: 10, color: "var(--text-muted)" }}>Quote 2</label><Cell value={f.quote_2} onChange={v => set(i, "quote_2", v)} placeholder='"Quote..."' multiline /></div>
            <div><label style={{ fontSize: 10, color: "var(--text-muted)" }}>Quote 3</label><Cell value={f.quote_3} onChange={v => set(i, "quote_3", v)} placeholder='"Quote..."' multiline /></div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════
// TAB: PROBLEM & SOLUTION (multiple mechanisms)
// ════════════════════════════════════════════════

function ProblemSolutionTab({ data, onChange, workspaceId }) {
  const items = Array.isArray(data) ? data : (data && typeof data === "object" && data.problem_name ? [data] : []);
  useAutoSave(workspaceId, "problem_solution", items);

  const [openIdx, setOpenIdx] = useState(null);

  const add = () => {
    const n = [...items, { title: "Mechanism " + (items.length + 1), problem_name: "", problem_research: "", problem_summary: "", problem_simple: "", problem_metaphor: "", problem_copy: "", solution_name: "", solution_research: "", solution_summary: "", solution_simple: "", solution_metaphor: "", solution_copy: "" }];
    onChange(n);
    setOpenIdx(n.length - 1);
  };
  const remove = (i) => { onChange(items.filter((_, j) => j !== i)); if (openIdx === i) setOpenIdx(null); };
  const set = (i, k, v) => { const n = [...items]; n[i] = { ...n[i], [k]: v }; onChange(n); };

  const FieldSet = ({ idx, prefix, title, color }) => (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</div>
      <div style={{ display: "grid", gap: 10 }}>
        <div><label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>The {title}</label><Cell value={items[idx]?.[prefix + "_name"]} onChange={v => set(idx, prefix + "_name", v)} placeholder={`What is the ${title.toLowerCase()}?`} /></div>
        <div><label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>Research Document</label><Cell value={items[idx]?.[prefix + "_research"]} onChange={v => set(idx, prefix + "_research", v)} placeholder="Link to research doc..." /></div>
        <div><label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>Summary</label><Cell value={items[idx]?.[prefix + "_summary"]} onChange={v => set(idx, prefix + "_summary", v)} placeholder="Summary of findings..." multiline style={{ minHeight: 80 }} /></div>
        <div><label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>4th-Grade Explanation</label><Cell value={items[idx]?.[prefix + "_simple"]} onChange={v => set(idx, prefix + "_simple", v)} placeholder="Explain it like I'm 10..." multiline style={{ minHeight: 80 }} /></div>
        <div><label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>Visual Metaphor</label><Cell value={items[idx]?.[prefix + "_metaphor"]} onChange={v => set(idx, prefix + "_metaphor", v)} placeholder="A relatable metaphor..." multiline /></div>
        <div><label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)" }}>Copywriting Example</label><Cell value={items[idx]?.[prefix + "_copy"]} onChange={v => set(idx, prefix + "_copy", v)} placeholder="Example ad copy..." multiline style={{ minHeight: 80 }} /></div>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="section-title" style={{ margin: 0 }}>Problem & Solution Mechanisms</div>
        <button onClick={add} className="btn btn-primary btn-sm">+ New Mechanism</button>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 14 }}>Each mechanism pairs a root problem with its unique solution. Click to expand and fill in the details.</div>

      {items.length === 0 && <div className="empty-state">No mechanisms yet. Click "+ New Mechanism" to create your first one.</div>}

      {items.map((item, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          {/* Collapsed card */}
          <div
            className="card-flat"
            onClick={() => setOpenIdx(openIdx === i ? null : i)}
            style={{ padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderLeft: openIdx === i ? "3px solid var(--accent)" : "3px solid transparent" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 14, transition: "transform 0.2s", transform: openIdx === i ? "rotate(90deg)" : "rotate(0deg)" }}>▸</span>
              <div>
                <input
                  className="input"
                  value={item.title || ""}
                  onChange={e => { e.stopPropagation(); set(i, "title", e.target.value); }}
                  onClick={e => e.stopPropagation()}
                  placeholder="Mechanism name..."
                  style={{ fontSize: 13, fontWeight: 700, border: "none", background: "transparent", padding: 0, color: "var(--text-primary)" }}
                />
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                  {item.problem_name ? `Problem: ${item.problem_name}` : "No problem defined"}
                  {" · "}
                  {item.solution_name ? `Solution: ${item.solution_name}` : "No solution defined"}
                </div>
              </div>
            </div>
            <button onClick={e => { e.stopPropagation(); remove(i); }} className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }}>Remove</button>
          </div>

          {/* Expanded view */}
          {openIdx === i && (
            <div style={{ padding: "16px 20px", background: "var(--bg-elevated)", border: "1px solid var(--border-light)", borderTop: "none", borderRadius: "0 0 12px 12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                <FieldSet idx={i} prefix="problem" title="Problem" color="var(--red)" />
                <FieldSet idx={i} prefix="solution" title="Solution" color="var(--green)" />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════
// TAB: HEADLINES
// ════════════════════════════════════════════════

function HeadlinesTab({ data, onChange, workspaceId }) {
  const items = data || [];
  useAutoSave(workspaceId, "headlines", data);

  const add = () => onChange([...items, { headline: "", trigger: "", desire: "" }]);
  const remove = (i) => onChange(items.filter((_, j) => j !== i));
  const set = (i, k, v) => { const n = [...items]; n[i] = { ...n[i], [k]: v }; onChange(n); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="section-title" style={{ margin: 0 }}>Headlines</div>
        <button onClick={add} className="btn btn-primary btn-sm">+ Add Headline</button>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Map each headline to the emotional trigger and desire it targets.</div>
      {items.length === 0 && <div className="empty-state">No headlines yet.</div>}
      {items.map((h, i) => (
        <div key={i} className="card-flat" style={{ padding: "10px 14px", marginBottom: 6, display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ flex: 2 }}><Cell value={h.headline} onChange={v => set(i, "headline", v)} placeholder="Headline text..." /></div>
          <div style={{ flex: 1 }}><Cell value={h.trigger} onChange={v => set(i, "trigger", v)} placeholder="Emotional trigger" /></div>
          <div style={{ flex: 1 }}><Cell value={h.desire} onChange={v => set(i, "desire", v)} placeholder="Desire targeted" /></div>
          <button onClick={() => remove(i)} className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }}>×</button>
        </div>
      ))}
      {items.length > 0 && (
        <div style={{ display: "flex", gap: 8, padding: "4px 14px", fontSize: 10, color: "var(--text-muted)" }}>
          <div style={{ flex: 2 }}>Headline</div><div style={{ flex: 1 }}>Trigger</div><div style={{ flex: 1 }}>Desire</div><div style={{ width: 28 }}></div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════
// TAB: MARKET SOPHISTICATION
// ════════════════════════════════════════════════

function MarketTab({ data, onChange, workspaceId }) {
  const d = data || {};
  useAutoSave(workspaceId, "market_sophistication", data);

  const set = (k, v) => onChange({ ...d, [k]: v });

  return (
    <div>
      <div className="section-title">Market Sophistication</div>
      <div style={{ display: "grid", gap: 14, maxWidth: 700 }}>
        <div><label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>What is your product?</label><Cell value={d.product_desc} onChange={v => set("product_desc", v)} placeholder="Describe your product..." multiline /></div>
        <div><label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>How does your product solve the problem?</label><Cell value={d.how_solve} onChange={v => set("how_solve", v)} placeholder="How it works..." multiline style={{ minHeight: 80 }} /></div>
        <div><label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Competitor Research</label><Cell value={d.competitor_research} onChange={v => set("competitor_research", v)} placeholder="Link to research..." /></div>
        <div><label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Competitors (same product)</label><Cell value={d.competitors_product} onChange={v => set("competitors_product", v)} placeholder="List competitors selling the same product..." multiline /></div>
        <div><label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Competitors (same problem, different product)</label><Cell value={d.competitors_problem} onChange={v => set("competitors_problem", v)} placeholder="List competitors solving the same problem differently..." multiline /></div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Market Sophistication Level</label>
          <select className="input" value={d.level || ""} onChange={e => set("level", e.target.value)} style={{ fontSize: 12, maxWidth: 300 }}>
            <option value="">Select level...</option>
            <option value="1">Level 1: New / First to market</option>
            <option value="2">Level 2: Second wave / Enlarged claims</option>
            <option value="3">Level 3: Mechanism driven</option>
            <option value="4">Level 4: Skeptical / Jaded market</option>
            <option value="5">Level 5: Completely exhausted / Identity driven</option>
          </select>
        </div>
        <div><label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Actions to match market sophistication</label><Cell value={d.actions} onChange={v => set("actions", v)} placeholder="Creative/copy strategy to match your market level..." multiline style={{ minHeight: 80 }} /></div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// TAB: PRODUCT
// ════════════════════════════════════════════════

function ProductTab({ data, onChange, workspaceId }) {
  const items = data || [];
  useAutoSave(workspaceId, "products", data);

  const add = () => onChange([...items, { name: "", feature: "", why: "", benefit_1: "", benefit_2: "", trigger: "", desire: "" }]);
  const remove = (i) => onChange(items.filter((_, j) => j !== i));
  const set = (i, k, v) => { const n = [...items]; n[i] = { ...n[i], [k]: v }; onChange(n); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="section-title" style={{ margin: 0 }}>Product Features & Benefits</div>
        <button onClick={add} className="btn btn-primary btn-sm">+ Add Feature</button>
      </div>
      {items.length === 0 && <div className="empty-state">No product features yet.</div>}
      {items.map((p, i) => (
        <div key={i} className="card-flat" style={{ padding: 14, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8, flex: 1 }}>
              <Cell value={p.name} onChange={v => set(i, "name", v)} placeholder="Product name" style={{ maxWidth: 150, fontWeight: 600 }} />
              <Cell value={p.feature} onChange={v => set(i, "feature", v)} placeholder="Feature" style={{ flex: 1 }} />
            </div>
            <button onClick={() => remove(i)} className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }}>Remove</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 8 }}>
            <div><label style={{ fontSize: 9, color: "var(--text-muted)" }}>Why included?</label><Cell value={p.why} onChange={v => set(i, "why", v)} placeholder="Why..." multiline /></div>
            <div><label style={{ fontSize: 9, color: "var(--text-muted)" }}>Benefit ("so you can...")</label><Cell value={p.benefit_1} onChange={v => set(i, "benefit_1", v)} placeholder="Benefit..." multiline /></div>
            <div><label style={{ fontSize: 9, color: "var(--text-muted)" }}>Benefit of Benefit</label><Cell value={p.benefit_2} onChange={v => set(i, "benefit_2", v)} placeholder="Deeper benefit..." multiline /></div>
            <div><label style={{ fontSize: 9, color: "var(--text-muted)" }}>Emotional Trigger</label><Cell value={p.trigger} onChange={v => set(i, "trigger", v)} placeholder="Trigger" /></div>
            <div><label style={{ fontSize: 9, color: "var(--text-muted)" }}>Desire</label><Cell value={p.desire} onChange={v => set(i, "desire", v)} placeholder="Desire" /></div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════
// TAB: OBJECTIONS
// ════════════════════════════════════════════════

function ObjectionsTab({ data, onChange, workspaceId }) {
  const items = data || [];
  useAutoSave(workspaceId, "objections", data);

  const add = (type) => onChange([...items, { type, objection: "", thinking: "", fear: "", handle: "" }]);
  const remove = (i) => onChange(items.filter((_, j) => j !== i));
  const set = (i, k, v) => { const n = [...items]; n[i] = { ...n[i], [k]: v }; onChange(n); };

  const problemObjs = items.filter(o => o.type === "problem");
  const productObjs = items.filter(o => o.type === "product");

  const renderGroup = (title, objs, type) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{title}</span>
        <button onClick={() => add(type)} className="btn btn-ghost btn-xs">+ Add</button>
      </div>
      {objs.length === 0 && <div className="empty-state" style={{ padding: 12 }}>None yet</div>}
      {objs.map((o) => {
        const realIdx = items.indexOf(o);
        return (
          <div key={realIdx} className="card-flat" style={{ padding: 12, marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <Cell value={o.objection} onChange={v => set(realIdx, "objection", v)} placeholder="The objection..." style={{ fontWeight: 600, flex: 1 }} />
              <button onClick={() => remove(realIdx)} className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div><label style={{ fontSize: 9, color: "var(--text-muted)" }}>What they're really thinking</label><Cell value={o.thinking} onChange={v => set(realIdx, "thinking", v)} placeholder='"..."' multiline /></div>
              <div><label style={{ fontSize: 9, color: "var(--text-muted)" }}>Underlying Fear / Belief</label><Cell value={o.fear} onChange={v => set(realIdx, "fear", v)} placeholder="Deep fear..." multiline /></div>
              <div><label style={{ fontSize: 9, color: "var(--text-muted)" }}>How to Handle</label><Cell value={o.handle} onChange={v => set(realIdx, "handle", v)} placeholder="Response strategy..." multiline /></div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div>
      <div className="section-title">Objections</div>
      {renderGroup("Problem Objections", problemObjs, "problem")}
      {renderGroup("Product Objections", productObjs, "product")}
    </div>
  );
}

// ════════════════════════════════════════════════
// TAB: ADS LAB (Connected to Pipeline)
// ════════════════════════════════════════════════

const AD_STATUS_OPTIONS = ["Concept", "Scripted", "In Production", "Ready to Launch", "Live", "Winner", "Killed"];
const AD_FORMAT_OPTIONS = ["UGC", "Image", "Carousel", "VSL", "Talking Head", "B-Roll", "Mashup", "Other"];
const GRABS_OPTIONS = ["Yes - Strong Hook", "Somewhat", "No - Weak", "Untested"];

function AdsLabTab({ ads, dispatch, strategyData, editors }) {
  const avatarNames = (strategyData?.avatars || []).map(a => a.name).filter(Boolean);
  const desireList = (strategyData?.desires || []).map(d => d.want).filter(Boolean);
  const triggerList = (strategyData?.emotional_triggers || []).map(t => t.trigger).filter(Boolean);
  const [newName, setNewName] = useState("");

  const updateStrategy = (adId, key, value) => {
    dispatch({ type: "UPDATE", id: adId, data: { strategy: { ...((ads.find(a => a.id === adId) || {}).strategy || {}), [key]: value } } });
  };

  const addNewRow = () => {
    const name = newName.trim() || "New Ad " + (ads.length + 1);
    dispatch({ type: "ADD_AD", ad: { name, type: "UGC", editor: "", deadline: "", brief: "", notes: "" } });
    setNewName("");
  };

  const COLS = "140px 60px 100px 1fr 90px 110px 1fr 100px 110px 120px 100px 1fr 80px 1fr 90px 100px";
  const HEADERS = ["Ad Name", "Batch", "Status", "Concept", "Format", "Avatar", "Hook / Headline", "Grabs Attn?", "Desire", "Trigger", "Objections?", "Why Not?", "Confidence", "Why It Should Work", "Results", "Key Learnings"];
  const visibleAds = ads.filter(a => a.stage !== "killed");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div className="section-title" style={{ margin: 0 }}>Ads Lab</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input className="input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ad name..." style={{ fontSize: 11, width: 160 }} onKeyDown={e => e.key === "Enter" && addNewRow()} />
          <button onClick={addNewRow} className="btn btn-primary btn-sm">+ Add Row</button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>Spreadsheet view of all ads with creative strategy fields. New rows also appear in Pipeline.</div>

      <div className="ads-lab-scroll" style={{ border: "1px solid var(--border-light)", borderRadius: 10 }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 0, padding: "8px 0", borderBottom: "2px solid var(--border)", minWidth: 1700, background: "var(--bg-elevated)" }}>
          {HEADERS.map(h => (
            <div key={h} style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, padding: "0 6px" }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {visibleAds.map((ad, rowIdx) => {
          const s = ad.strategy || {};
          const bg = rowIdx % 2 === 0 ? "transparent" : "var(--bg-elevated)";
          return (
            <div key={ad.id} style={{ display: "grid", gridTemplateColumns: COLS, gap: 0, padding: "3px 0", borderBottom: "1px solid var(--border-light)", alignItems: "center", minWidth: 1700, background: bg }}>
              <div style={{ padding: "0 6px", fontSize: 11, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ad.name}>{ad.name}</div>
              <input className="input" value={s.batch || ""} onChange={e => updateStrategy(ad.id, "batch", e.target.value)} placeholder="#" style={{ fontSize: 10, padding: "4px 6px", border: "none", background: "transparent" }} />
              <select className="input" value={s.ad_status || ""} onChange={e => updateStrategy(ad.id, "ad_status", e.target.value)} style={{ fontSize: 10, padding: "4px 4px", border: "none", background: "transparent" }}>
                <option value="">...</option>
                {AD_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <input className="input" value={s.concept || ""} onChange={e => updateStrategy(ad.id, "concept", e.target.value)} placeholder="Concept..." style={{ fontSize: 10, padding: "4px 6px", border: "none", background: "transparent" }} />
              <select className="input" value={s.format || ad.type || ""} onChange={e => updateStrategy(ad.id, "format", e.target.value)} style={{ fontSize: 10, padding: "4px 4px", border: "none", background: "transparent" }}>
                <option value="">...</option>
                {AD_FORMAT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <select className="input" value={s.avatar || ""} onChange={e => updateStrategy(ad.id, "avatar", e.target.value)} style={{ fontSize: 10, padding: "4px 4px", border: "none", background: "transparent" }}>
                <option value="">...</option>
                {avatarNames.map(a => <option key={a} value={a}>{a.length > 30 ? a.slice(0, 30) + "..." : a}</option>)}
              </select>
              <input className="input" value={s.hook || ""} onChange={e => updateStrategy(ad.id, "hook", e.target.value)} placeholder="Hook..." style={{ fontSize: 10, padding: "4px 6px", border: "none", background: "transparent" }} />
              <select className="input" value={s.grabs_attention || ""} onChange={e => updateStrategy(ad.id, "grabs_attention", e.target.value)} style={{ fontSize: 10, padding: "4px 4px", border: "none", background: "transparent" }}>
                <option value="">...</option>
                {GRABS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <select className="input" value={s.desire || ""} onChange={e => updateStrategy(ad.id, "desire", e.target.value)} style={{ fontSize: 10, padding: "4px 4px", border: "none", background: "transparent" }}>
                <option value="">...</option>
                {desireList.map(d => <option key={d} value={d}>{d.length > 30 ? d.slice(0, 30) + "..." : d}</option>)}
              </select>
              <select className="input" value={s.trigger || ""} onChange={e => updateStrategy(ad.id, "trigger", e.target.value)} style={{ fontSize: 10, padding: "4px 4px", border: "none", background: "transparent" }}>
                <option value="">...</option>
                {triggerList.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="input" value={s.handles_objections || ""} onChange={e => updateStrategy(ad.id, "handles_objections", e.target.value)} style={{ fontSize: 10, padding: "4px 4px", border: "none", background: "transparent" }}>
                <option value="">...</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
                <option value="Partially">Partially</option>
              </select>
              <input className="input" value={s.why_not || ""} onChange={e => updateStrategy(ad.id, "why_not", e.target.value)} placeholder="If no, why..." style={{ fontSize: 10, padding: "4px 6px", border: "none", background: "transparent" }} />
              <input className="input" type="number" min="1" max="10" value={s.confidence || ""} onChange={e => updateStrategy(ad.id, "confidence", e.target.value)} placeholder="1-10" style={{ fontSize: 10, padding: "4px 6px", border: "none", background: "transparent" }} />
              <input className="input" value={s.why_work || ""} onChange={e => updateStrategy(ad.id, "why_work", e.target.value)} placeholder="Why it should work..." style={{ fontSize: 10, padding: "4px 6px", border: "none", background: "transparent" }} />
              <input className="input" value={s.results || ""} onChange={e => updateStrategy(ad.id, "results", e.target.value)} placeholder="Results..." style={{ fontSize: 10, padding: "4px 6px", border: "none", background: "transparent" }} />
              <input className="input" value={s.learnings || ""} onChange={e => updateStrategy(ad.id, "learnings", e.target.value)} placeholder="Learnings..." style={{ fontSize: 10, padding: "4px 6px", border: "none", background: "transparent" }} />
            </div>
          );
        })}

        {/* Empty row hint */}
        {visibleAds.length === 0 && (
          <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>No ads yet. Use "+ Add Row" above to create your first ad.</div>
        )}
      </div>

      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>{visibleAds.length} ad{visibleAds.length !== 1 ? "s" : ""} in lab · New rows also appear in Pipeline</div>
    </div>
  );
}

// ════════════════════════════════════════════════
// MAIN STRATEGY PAGE
// ════════════════════════════════════════════════

export default function StrategyPage({ activeWorkspaceId, ads, dispatch }) {
  const [tab, setTab] = useState("brand");
  const [loading, setLoading] = useState(true);
  const [strat, setStrat] = useState({
    brand_info: {},
    avatars: [],
    desires: [],
    emotional_triggers: [],
    fears: [],
    problem_solution: [],
    headlines: [],
    market_sophistication: {},
    products: [],
    objections: [],
  });

  useEffect(() => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    fetchStrategyData(activeWorkspaceId).then(data => {
      if (data) {
        setStrat({
          brand_info: data.brand_info || {},
          avatars: data.avatars || [],
          desires: data.desires || [],
          emotional_triggers: data.emotional_triggers || [],
          fears: data.fears || [],
          problem_solution: Array.isArray(data.problem_solution) ? data.problem_solution : (data.problem_solution && typeof data.problem_solution === "object" && Object.keys(data.problem_solution).length > 0 ? [data.problem_solution] : []),
          headlines: data.headlines || [],
          market_sophistication: data.market_sophistication || {},
          products: data.products || [],
          objections: data.objections || [],
        });
      }
    }).catch(e => console.error("Load strategy:", e)).finally(() => setLoading(false));

    // Realtime: re-fetch when another user edits strategy
    const unsub = subscribeToStrategy(activeWorkspaceId, () => {
      fetchStrategyData(activeWorkspaceId).then(data => {
        if (data) {
          setStrat(prev => {
            // Only update sections the local user isn't actively editing (simple merge)
            const next = { ...prev };
            const sections = ["brand_info", "avatars", "desires", "emotional_triggers", "fears", "problem_solution", "headlines", "market_sophistication", "products", "objections"];
            sections.forEach(s => {
              if (s === "problem_solution") {
                next[s] = Array.isArray(data[s]) ? data[s] : (data[s] && typeof data[s] === "object" && Object.keys(data[s]).length > 0 ? [data[s]] : prev[s]);
              } else {
                next[s] = data[s] ?? prev[s];
              }
            });
            return next;
          });
        }
      }).catch(() => {});
    });

    return () => { unsub(); };
  }, [activeWorkspaceId]);

  const updateSection = (section) => (value) => {
    setStrat(prev => ({ ...prev, [section]: value }));
  };

  if (loading) return <div className="empty-state">Loading strategy data...</div>;

  return (
    <div className="animate-fade">
      <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Creative Strategy</h2>
      <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "0 0 16px" }}>Your complete creative strategy sheet — avatars, research, angles, and ad lab.</p>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 2, flexWrap: "wrap", marginBottom: 18, borderBottom: "1px solid var(--border-light)", paddingBottom: 8 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`btn btn-xs ${tab === t.id ? "btn-primary" : "btn-ghost"}`}
            style={{ fontSize: 11, gap: 4, display: "flex", alignItems: "center" }}
          >
            <span style={{ fontSize: 13 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "brand" && <BrandTab data={strat.brand_info} onChange={updateSection("brand_info")} workspaceId={activeWorkspaceId} />}
      {tab === "avatars" && <AvatarsTab data={strat.avatars} onChange={updateSection("avatars")} workspaceId={activeWorkspaceId} />}
      {tab === "desires" && <DesiresTab data={strat.desires} onChange={updateSection("desires")} workspaceId={activeWorkspaceId} />}
      {tab === "triggers" && <TriggersTab data={strat.emotional_triggers} onChange={updateSection("emotional_triggers")} workspaceId={activeWorkspaceId} />}
      {tab === "fears" && <FearsTab data={strat.fears} onChange={updateSection("fears")} workspaceId={activeWorkspaceId} />}
      {tab === "problem" && <ProblemSolutionTab data={strat.problem_solution} onChange={updateSection("problem_solution")} workspaceId={activeWorkspaceId} />}
      {tab === "headlines" && <HeadlinesTab data={strat.headlines} onChange={updateSection("headlines")} workspaceId={activeWorkspaceId} />}
      {tab === "market" && <MarketTab data={strat.market_sophistication} onChange={updateSection("market_sophistication")} workspaceId={activeWorkspaceId} />}
      {tab === "product" && <ProductTab data={strat.products} onChange={updateSection("products")} workspaceId={activeWorkspaceId} />}
      {tab === "objections" && <ObjectionsTab data={strat.objections} onChange={updateSection("objections")} workspaceId={activeWorkspaceId} />}
      {tab === "adslab" && <AdsLabTab ads={ads} dispatch={dispatch} strategyData={strat} editors={[]} />}
      {tab === "ai" && <ProductIntelligence activeWorkspaceId={activeWorkspaceId} />}
    </div>
  );
}
