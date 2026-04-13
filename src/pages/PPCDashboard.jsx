/**
 * PPCDashboard.jsx — OPS SUITE themed PPC Dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 * Matches the OPS SUITE dark-gold aesthetic shown in design references.
 *
 * API calls (all via useCampaignStore → axios → backend):
 *   GET  /api/v1/campaign/get       → load PPC's own campaigns
 *   POST /api/v1/campaign/create    → { message, requestedAt, teamId }
 *   POST /api/v1/campaign/update    → { campaignId, message, status, requestedAt }
 *
 * Layout:
 *   • Sidebar  — hamburger-collapsible on mobile, fixed on desktop
 *   • Status cards — clickable filters (collapse behind toggle on mobile)
 *   • Campaign table — horizontal-scroll on mobile, search always visible
 *   • Create Campaign — dedicated route section (not modal)
 *   • Update modal — single button merging edit + cancel
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import useCampaignStore   from "../stores/useCampaignStore.js";
import useAuthStore       from "../stores/useAuthStore.js";
import useNotifStore      from "../stores/useNotificationStore.js";
import { io } from "socket.io-client";
/* ─── Font injection ─────────────────────────────────────────────────────── */
const injectFonts = () => {
  if (document.getElementById("ops-fonts")) return;
  const l = document.createElement("link");
  l.id   = "ops-fonts";
  l.rel  = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@400;500&display=swap";
  document.head.appendChild(l);
};

/* ─── Design tokens ──────────────────────────────────────────────────────── */
const T = {
  bg:         "#0c0b08",
  bgSide:     "#0f0e0a",
  bgCard:     "#141310",
  bgRow:      "#111009",
  bgInput:    "#0a0908",
  gold:       "#c9a42a",
  goldLight:  "#e2bc4a",
  goldDim:    "rgba(201,164,42,0.13)",
  goldBorder: "rgba(201,164,42,0.20)",
  text:       "#e8ddc8",
  muted:      "#7a7060",
  subtle:     "#2e2c22",
  white:      "#f5edd8",
  red:        "#e05252",
  redBg:      "rgba(224,82,82,0.12)",
  teal:       "#3ecfb2",
  tealBg:     "rgba(62,207,178,0.11)",
  blue:       "#5b9cf6",
  blueBg:     "rgba(91,156,246,0.11)",
  amber:      "#f0a030",
  amberBg:    "rgba(240,160,48,0.11)",
  green:      "#4cbb7f",
  greenBg:    "rgba(76,187,127,0.11)",
  sideW:      220,
};

/* ─── Status metadata ────────────────────────────────────────────────────── */
/*
 * Campaign.status values (PPC controls):  transfer | cancel | done | not done
 * Campaign.action  values (PM controls):  approve  | cancel | done
 */
const STATUS_META = {
  transfer:   { label: "IN REVIEW",  color: T.blue,  bg: T.blueBg  },
  cancel:     { label: "CANCELLED",  color: T.red,   bg: T.redBg   },
  done:       { label: "DONE",       color: T.green, bg: T.greenBg },
  "not done": { label: "NOT DONE",   color: T.amber, bg: T.amberBg },
};
const ACTION_META = {
  approve: { label: "APPROVED",  color: T.teal,  bg: T.tealBg  },
  cancel:  { label: "REJECTED",  color: T.red,   bg: T.redBg   },
  done:    { label: "COMPLETED", color: T.green, bg: T.greenBg },
};

/* Filter card definitions — id maps to campaign.status or campaign.action */
const FILTER_CARDS = [
  { id: "transfer",  label: "In Review",  color: T.blue,  bg: T.blueBg  },
  { id: "approve",   label: "Approved",   color: T.teal,  bg: T.tealBg  },
  { id: "done",      label: "Done",       color: T.green, bg: T.greenBg },
  { id: "cancel",    label: "Cancelled",  color: T.red,   bg: T.redBg   },
  { id: "not done",  label: "Not Done",   color: T.amber, bg: T.amberBg },
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const fmt = (d) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("en-IN", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return d; }
};

const fmtDate = (d) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  catch { return d; }
};

const fmtTime = (d) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); }
  catch { return d; }
};

const initials = (n = "") =>
  n.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("") || "P";

/* ─── SVG Diamond Logo ───────────────────────────────────────────────────── */
const DiamondLogo = ({ size = 34 }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
    <polygon points="18,2 34,18 18,34 2,18" fill="none" stroke={T.gold} strokeWidth="1.8" />
    <polygon points="18,8 29,18 18,28 7,18"  fill={T.goldDim} stroke={T.gold} strokeWidth="1" />
    <polygon points="18,13 23,18 18,23 13,18" fill={T.gold} />
  </svg>
);

/* ─── StatusBadge ────────────────────────────────────────────────────────── */
function StatusBadge({ value, meta = STATUS_META }) {
  const m = meta[value] ?? { label: (value ?? "—").toUpperCase(), color: T.muted, bg: "rgba(122,112,96,0.11)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 9px", borderRadius: 2,
      background: m.bg, color: m.color,
      fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
      fontFamily: "'Cinzel', serif", whiteSpace: "nowrap",
      border: `1px solid ${m.color}33`,
    }}>
      {m.label}
    </span>
  );
}

/* ─── Gold action button ─────────────────────────────────────────────────── */
function GoldBtn({ children, onClick, disabled, style = {}, type = "button", variant = "fill" }) {
  const [hov, setHov] = useState(false);
  const [act, setAct] = useState(false);
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setAct(false); }}
      onMouseDown={() => setAct(true)}
      onMouseUp={() => setAct(false)}
      style={{
        padding: "11px 22px", borderRadius: 3,
        fontSize: 11, fontWeight: 600, letterSpacing: "0.14em",
        fontFamily: "'Cinzel', serif", cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1, transition: "all 0.15s",
        transform: act ? "scale(0.98)" : "scale(1)",
        background: variant === "fill" ? (hov ? T.goldLight : T.gold) : (hov ? T.goldDim : "transparent"),
        color:      variant === "fill" ? "#0c0b08"                    : (hov ? T.goldLight : T.gold),
        border: `1px solid ${variant === "fill" ? T.gold : T.goldBorder}`,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ─── Form input shared style ────────────────────────────────────────────── */
const inputSx = {
  width: "100%", boxSizing: "border-box",
  background: T.bgInput, border: `1px solid ${T.subtle}`,
  borderRadius: 3, color: T.text,
  fontSize: 13, padding: "11px 14px", outline: "none",
  fontFamily: "'DM Sans', sans-serif", transition: "border-color 0.2s, box-shadow 0.2s",
};

/* ─── Field wrapper ──────────────────────────────────────────────────────── */
function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 9, fontWeight: 600, letterSpacing: "0.18em",
        color: T.gold, fontFamily: "'Cinzel', serif", marginBottom: 8,
      }}>
        {label}
        {hint && <span style={{ color: T.muted, fontWeight: 400, fontSize: 9, letterSpacing: "0.06em", fontFamily: "'DM Sans', sans-serif", marginLeft: 6 }}>({hint})</span>}
      </div>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   UPDATE MODAL
   Merged "Edit + Cancel" into one UPDATE modal matching OPS SUITE style.
   PPC can choose: Transfer (edit message/date) or Cancel.
═══════════════════════════════════════════════════════════════════════════ */
function UpdateModal({ campaign, onClose, onSave }) {
  const [status,      setStatus]      = useState("transfer");  // "transfer" | "cancel"
  const [message,     setMessage]     = useState(campaign?.message || "");
  const [requestedAt, setRequestedAt] = useState(campaign?.requestedAt?.slice?.(0,16) || "");
  const [busy,        setBusy]        = useState(false);
  const [err,         setErr]         = useState("");

  /* Close on Escape */
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  if (!campaign) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (status === "transfer" && !message.trim()) {
      setErr("Message is required for Transfer status.");
      return;
    }
    setErr("");
    setBusy(true);
    try {
      /* POST /api/v1/campaign/update → { campaignId, message, status, requestedAt } */
      await onSave(campaign._id, {
        message:     status === "transfer" ? message.trim() : campaign.message,
        status,
        requestedAt: status === "transfer" ? (requestedAt || undefined) : undefined,
      });
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.message || "Update failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.78)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div style={{
        background: T.bgCard, border: `1px solid ${T.goldBorder}`,
        borderRadius: 4, padding: "28px 26px 24px",
        width: "100%", maxWidth: 460,
        animation: "opsIn 0.22s cubic-bezier(.22,1,.36,1)",
      }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <p style={{ margin: 0, fontSize: 8, letterSpacing: "0.22em", color: T.gold, fontFamily: "'Cinzel', serif" }}>— UPDATE CAMPAIGN</p>
            <h3 style={{ margin: "4px 0 0", fontSize: 17, fontWeight: 600, color: T.white, fontFamily: "'Cinzel', serif" }}>
              Campaign Request
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: `1px solid ${T.subtle}`,
              color: T.muted, cursor: "pointer",
              width: 28, height: 28, borderRadius: 2, fontSize: 13,
              display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.color = T.red; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.subtle; e.currentTarget.style.color = T.muted; }}
          >✕</button>
        </div>

        {/* Current message preview */}
        <div style={{
          padding: "9px 12px", background: T.bgInput,
          border: `1px solid ${T.subtle}`, borderRadius: 3, marginBottom: 20,
        }}>
          <p style={{ margin: 0, fontSize: 9, letterSpacing: "0.12em", color: T.muted, fontFamily: "'Cinzel', serif", marginBottom: 4 }}>CURRENT</p>
          <p style={{ margin: 0, fontSize: 12, color: T.text, lineHeight: 1.5 }}>{campaign.message}</p>
        </div>

        {err && (
          <div style={{
            padding: "9px 13px", background: T.redBg,
            border: `1px solid ${T.red}44`, borderRadius: 3, color: T.red,
            fontSize: 12, marginBottom: 16, fontFamily: "'DM Sans', sans-serif",
          }}>{err}</div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Action selector — Transfer or Cancel */}
          <Field label="PPC ACTION">
            <div style={{ display: "flex", gap: 10, marginBottom: 0 }}>
              {[
                { val: "transfer", label: "TRANSFER", desc: "Edit & keep active" },
                { val: "cancel",   label: "CANCEL",   desc: "Cancel this campaign" },
              ].map(({ val, label, desc }) => {
                const isActive  = status === val;
                const isCancel  = val === "cancel";
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setStatus(val)}
                    style={{
                      flex: 1, padding: "11px 10px", borderRadius: 3, cursor: "pointer",
                      background: isActive ? (isCancel ? T.redBg : T.goldDim) : T.bgInput,
                      border: `1px solid ${isActive ? (isCancel ? T.red : T.gold) : T.subtle}`,
                      color: isActive ? (isCancel ? T.red : T.gold) : T.muted,
                      transition: "all 0.15s",
                      transform: isActive ? "scale(1.02)" : "scale(1)",
                    }}
                    onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = T.goldBorder; e.currentTarget.style.color = T.gold; } }}
                    onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = T.subtle;      e.currentTarget.style.color = T.muted; } }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", fontFamily: "'Cinzel', serif", marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 10, opacity: 0.7, fontFamily: "'DM Sans', sans-serif" }}>{desc}</div>
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Transfer fields */}
          {status === "transfer" && (
            <>
              <Field label="MESSAGE" hint="required">
                <textarea
                  className="ops-focus"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Describe the campaign request…"
                  rows={3}
                  required
                  style={{ ...inputSx, resize: "vertical", lineHeight: 1.6 }}
                />
              </Field>
              <Field label="REQUESTED DATE / TIME" hint="optional">
                <input
                  type="datetime-local"
                  className="ops-focus"
                  value={requestedAt}
                  onChange={e => setRequestedAt(e.target.value)}
                  style={{ ...inputSx, colorScheme: "dark" }}
                />
              </Field>
            </>
          )}

          {/* Cancel warning */}
          {status === "cancel" && (
            <div style={{
              padding: "11px 14px", background: T.redBg,
              border: `1px solid ${T.red}33`, borderRadius: 3, marginBottom: 18,
            }}>
              <p style={{ margin: 0, fontSize: 12, color: "#f09090", lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif" }}>
                ⚠ This will permanently set the campaign status to <strong style={{ color: T.red, letterSpacing: "0.06em" }}>CANCELLED</strong>. This action cannot be undone.
              </p>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, padding: "11px", borderRadius: 3, cursor: "pointer",
                background: "transparent", border: `1px solid ${T.subtle}`,
                color: T.muted, fontSize: 11, letterSpacing: "0.1em",
                fontFamily: "'Cinzel', serif", transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.goldBorder; e.currentTarget.style.color = T.gold; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.subtle; e.currentTarget.style.color = T.muted; }}
            >DISCARD</button>

            <button
              type="submit"
              disabled={busy}
              style={{
                flex: 2, padding: "11px", borderRadius: 3,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.6 : 1,
                background: status === "cancel" ? T.redBg : T.gold,
                border: `1px solid ${status === "cancel" ? T.red + "66" : T.gold}`,
                color: status === "cancel" ? T.red : "#0c0b08",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
                fontFamily: "'Cinzel', serif", transition: "all 0.15s",
              }}
              onMouseEnter={e => {
                if (!busy && status !== "cancel") e.currentTarget.style.background = T.goldLight;
                if (!busy && status === "cancel") e.currentTarget.style.background = "rgba(224,82,82,0.22)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = status === "cancel" ? T.redBg : T.gold;
              }}
            >
              {busy ? "SAVING…" : status === "cancel" ? "CONFIRM CANCEL" : "SAVE CHANGES"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Notification panel ─────────────────────────────────────────────────── */
function NotifPanel({ open, onClose }) {
  const { notifications, markRead, clearNotifs } = useNotifStore();
  useEffect(() => { if (open) markRead(); }, [open, markRead]);
  if (!open) return null;
  return (
    <div style={{
      position: "absolute", top: 46, right: 0, width: 290, zIndex: 600,
      background: T.bgCard, border: `1px solid ${T.goldBorder}`,
      borderRadius: 4, overflow: "hidden",
    }}>
      <div style={{
        padding: "11px 16px", borderBottom: `1px solid ${T.subtle}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.18em", color: T.gold, fontFamily: "'Cinzel', serif" }}>NOTIFICATIONS</span>
        <button onClick={clearNotifs} style={{ background: "none", border: "none", color: T.muted, fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Clear all</button>
      </div>
      <div style={{ maxHeight: 260, overflowY: "auto" }}>
        {notifications.length === 0 ? (
          <p style={{ padding: "18px 16px", textAlign: "center", color: T.muted, fontSize: 12, fontFamily: "'DM Sans', sans-serif", margin: 0 }}>No notifications</p>
        ) : notifications.map(n => (
          <div key={n.id} style={{ padding: "10px 16px", borderBottom: `1px solid ${T.subtle}22` }}>
            <p style={{ margin: 0, fontSize: 12, color: T.text, lineHeight: 1.4, fontFamily: "'DM Sans', sans-serif" }}>{n.message}</p>
            <p style={{ margin: "3px 0 0", fontSize: 9, color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>{fmt(n.time)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════════ */
export default function PPCDashboard() {
  injectFonts();

  /* ── Stores ─────────────────────────────────────────────────────────── */
  const campaigns      = useCampaignStore(s => s.campaigns);
  const getCampaign    = useCampaignStore(s => s.getCampaign);
  const createCampaign = useCampaignStore(s => s.createCampaign);
  const updateCampaign = useCampaignStore(s => s.updateCampaign);

  const user   = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);

  const addNotification = useNotifStore(s => s.addNotification);
  const unread          = useNotifStore(s => s.unread);

  const navigate = useNavigate();

  /* ── UI state ────────────────────────────────────────────────────────── */
  const [loading,        setLoading]        = useState(true);
  const [pageError,      setPageError]      = useState("");
  const [activeSection,  setActiveSection]  = useState("campaigns");  // "campaigns" | "create"
  const [sidebarOpen,    setSidebarOpen]    = useState(false);        // mobile sidebar toggle
  const [filtersOpen,    setFiltersOpen]    = useState(false);        // mobile filter cards toggle
  const [statusFilter,   setStatusFilter]   = useState(null);         // active filter id or null
  const [searchQuery,    setSearchQuery]    = useState("");
  const [showNotifs,     setShowNotifs]     = useState(false);
  const [updateTarget,   setUpdateTarget]   = useState(null);         // campaign being updated

  /* Create form */
  const [createForm,  setCreateForm]  = useState({ message: "", requestedAt: "" });
  const [creating,    setCreating]    = useState(false);
  const [createError, setCreateError] = useState("");
  const [createOk,    setCreateOk]   = useState(false);

  /* teamId — auto-extracted from campaigns or cached in localStorage */
  const [teamId,       setTeamId]       = useState(() => localStorage.getItem("ops_ppc_team_id") || "");
  const [teamIdInput,  setTeamIdInput]  = useState("");

  /* Responsive: track if mobile */
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const cb = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", cb);
    return () => window.removeEventListener("resize", cb);
  }, []);

  /* ── Load campaigns on mount ─────────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      try {
        /* GET /api/v1/campaign/get — returns only PPC's own campaigns */
        const data = await getCampaign();
        /* Auto-detect teamId from first campaign if not already stored */
        if (!teamId && Array.isArray(data) && data.length > 0) {
          const rawId = data[0].teamId;
          const tid = typeof rawId === "object" ? (rawId?._id || String(rawId)) : rawId;
          if (tid) {
            setTeamId(tid);
            localStorage.setItem("ops_ppc_team_id", tid);
          }
        }
      } catch {
        setPageError("Failed to load campaigns. Please refresh.");
      } finally {
        setLoading(false);
      }
    })();
  }, [getCampaign]); // eslint-disable-line

  /* ── Real-time socket integration ─────────────────────────────────────
   * Uncomment after: npm install socket.io-client
   * and add: import { io } from "socket.io-client";
   */
    useEffect(() => {
      const socket = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:3000", {
        withCredentials: true,
      });
   
      // campaign:created  → prepend to Zustand store
      socket.on("campaign:created", (c) => {
        useCampaignStore.setState(s => ({ campaigns: [c, ...s.campaigns] }));
        addNotification("New campaign created");
      });
   
      // campaign:updated  → patch matching campaign in store
      socket.on("campaign:updated", (c) => {
        useCampaignStore.setState(s => ({
          campaigns: s.campaigns.map(x => x._id === c._id ? c : x),
        }));
        addNotification(`Campaign updated`);
      });
   
      // campaign:it_ack   → IT responded
      socket.on("campaign:it_ack", (c) => {
        useCampaignStore.setState(s => ({
          campaigns: s.campaigns.map(x => x._id === c._id ? c : x),
        }));
        addNotification(`IT acknowledged: ${c.itMessage?.slice(0, 40)}`);
      });
   
      return () => socket.disconnect();
    }, [addNotification]);
   

  /* ── Derived stats ───────────────────────────────────────────────────── */
  const stats = useMemo(() => ({
    transfer:  campaigns.filter(c => c.status  === "transfer").length,
    approve:   campaigns.filter(c => c.action  === "approve").length,
    done:      campaigns.filter(c => c.status  === "done").length,
    cancel:    campaigns.filter(c => c.status  === "cancel").length,
    "not done":campaigns.filter(c => c.status  === "not done").length,
  }), [campaigns]);

  /* ── Filtered + searched list ────────────────────────────────────────── */
  const filtered = useMemo(() => {
    let list = [...campaigns];
    if (statusFilter) {
      list = statusFilter === "approve"
        ? list.filter(c => c.action === "approve")
        : list.filter(c => c.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => c.message?.toLowerCase().includes(q));
    }
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [campaigns, statusFilter, searchQuery]);

  /* ── Handlers ────────────────────────────────────────────────────────── */
  const handleLogout = useCallback(async () => {
    await logout();
    navigate("/login");
  }, [logout, navigate]);

  /* Clicking a filter card toggles it; clicking same card clears filter */
  const handleFilterClick = useCallback((id) => {
    setStatusFilter(prev => prev === id ? null : id);
    if (isMobile) setFiltersOpen(false);
  }, [isMobile]);

  /* Navigate section and close mobile sidebar */
  const goTo = (section) => {
    setActiveSection(section);
    setSidebarOpen(false);
    setCreateError("");
    setCreateOk(false);
  };

  /* Create campaign → POST /api/v1/campaign/create */
  const handleCreate = useCallback(async (e) => {
    e.preventDefault();
    setCreateError("");
    setCreateOk(false);

    if (!teamId.trim()) {
      setCreateError("Team ID is required. Please enter your Team ID below.");
      return;
    }
    if (!createForm.message.trim()) {
      setCreateError("Campaign message is required.");
      return;
    }

    setCreating(true);
    try {
      await createCampaign({
        message:     createForm.message.trim(),
        requestedAt: createForm.requestedAt || undefined,
        teamId:      teamId.trim(),
      });
      setCreateForm({ message: "", requestedAt: "" });
      setCreateOk(true);
      addNotification("Campaign created successfully");
      /* Redirect to campaigns after 1.8 s */
      setTimeout(() => { setActiveSection("campaigns"); setCreateOk(false); }, 1800);
    } catch (err) {
      setCreateError(err?.response?.data?.message || "Failed to create campaign.");
    } finally {
      setCreating(false);
    }
  }, [teamId, createForm, createCampaign, addNotification]);

  /* Update campaign → POST /api/v1/campaign/update */
  const handleUpdate = useCallback(async (campaignId, data) => {
    await updateCampaign(campaignId, data);
    addNotification(data.status === "cancel" ? "Campaign cancelled" : "Campaign updated");
  }, [updateCampaign, addNotification]);

  /* Save manually entered teamId */
  const saveTeamId = () => {
    const tid = teamIdInput.trim();
    if (!tid) return;
    setTeamId(tid);
    localStorage.setItem("ops_ppc_team_id", tid);
    setTeamIdInput("");
    setCreateError("");
  };

  /* ─────────────────────────────────────────────────────────────────────
     RENDER
  ────────────────────────────────────────────────────────────────────── */
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'DM Sans', sans-serif" }}>

      {/* Global styles + animations */}
      <style>{`
        @keyframes opsIn    { from { opacity:0; transform:translateY(14px) scale(.97); } to { opacity:1; transform:none; } }
        @keyframes opsFadeUp{ from { opacity:0; transform:translateY(8px);  }           to { opacity:1; transform:none; } }
        @keyframes opsPulse { 0%,100%{opacity:.6} 50%{opacity:1} }
        .ops-focus:focus    { border-color:${T.gold} !important; box-shadow:0 0 0 3px ${T.goldDim}; outline:none; }
        .ops-row            { cursor:default; transition:background .12s, box-shadow .12s; }
        .ops-row:hover      { background:${T.bgRow} !important; box-shadow:inset 3px 0 0 ${T.gold}55; }
        .ops-row:hover td:first-child { color:${T.gold}; }
        .ops-nav-btn        { transition:all .15s !important; }
        .ops-nav-btn:hover  { color:${T.gold} !important; background:${T.goldDim} !important; }
        .ops-nav-btn:active { transform:scale(.97) !important; }
        .ops-fcard          { transition:transform .18s, border-color .18s, box-shadow .18s; cursor:pointer; }
        .ops-fcard:hover    { transform:translateY(-3px); box-shadow:0 6px 24px rgba(0,0,0,.5); }
        .ops-fcard:active   { transform:translateY(-1px) scale(.98); }
        .ops-upd            { transition:all .15s !important; }
        .ops-upd:hover      { background:rgba(240,160,48,.22) !important; border-color:${T.amber} !important; transform:scale(1.05); }
        .ops-upd:active     { transform:scale(.97) !important; }
        button:focus-visible { outline:2px solid ${T.gold}; outline-offset:2px; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-thumb { background:${T.subtle}; border-radius:99px; }
        ::-webkit-scrollbar-track { background:transparent; }
        .ops-pending        { animation:opsPulse 2.4s ease-in-out infinite; }
      `}</style>

      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 7999, background: "rgba(0,0,0,0.72)" }}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SIDEBAR
      ═══════════════════════════════════════════════════════════════ */}
      <aside style={{
        width: T.sideW, minWidth: T.sideW,
        background: T.bgSide,
        borderRight: `1px solid ${T.goldBorder}`,
        display: "flex", flexDirection: "column",
        ...(isMobile ? {
          position: "fixed", top: 0, left: sidebarOpen ? 0 : -T.sideW,
          height: "100vh", zIndex: 8000, overflowY: "auto",
          transition: "left .28s cubic-bezier(.22,1,.36,1)",
          boxShadow: sidebarOpen ? "8px 0 48px rgba(0,0,0,.9)" : "none",
        } : {
          position: "sticky", top: 0, height: "100vh", overflowY: "auto",
        }),
      }}>

        {/* Brand */}
        <div style={{ padding: "22px 18px 20px", borderBottom: `1px solid ${T.goldBorder}`, display: "flex", alignItems: "center", gap: 12 }}>
          <DiamondLogo size={32} />
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.white, fontFamily: "'Cinzel', serif", letterSpacing: "0.1em" }}>OPS SUITE</p>
            <p style={{ margin: "2px 0 0", fontSize: 8, color: T.muted, letterSpacing: "0.2em" }}>PPC PANEL</p>
          </div>
        </div>

        {/* Navigation */}
        <div style={{ padding: "18px 10px 10px", flex: 1 }}>
          <p style={{ margin: "0 0 10px 10px", fontSize: 8, color: T.muted, letterSpacing: "0.2em", fontFamily: "'Cinzel', serif" }}>NAVIGATION ·</p>
          {[
            { id: "campaigns", label: "My Campaigns"    },
            { id: "create",    label: "Create Campaign" },
          ].map(item => {
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                className="ops-nav-btn"
                onClick={() => goTo(item.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  width: "100%", padding: "10px 12px 10px 10px",
                  borderRadius: 3, background: active ? T.goldDim : "transparent",
                  border: "none", color: active ? T.gold : T.muted,
                  fontSize: 13, fontWeight: active ? 500 : 400,
                  cursor: "pointer", marginBottom: 2,
                  fontFamily: "'DM Sans', sans-serif",
                  transition: "all .15s", textAlign: "left",
                }}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                  background: active ? T.gold : T.subtle, transition: "background .15s",
                }} />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* User + Sign Out */}
        <div style={{ padding: "14px 16px 20px", borderTop: `1px solid ${T.goldBorder}` }}>
          <p style={{ margin: "0 0 10px", fontSize: 8, letterSpacing: "0.2em", color: T.muted, fontFamily: "'Cinzel', serif" }}>— ACCOUNT</p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: T.goldDim, border: `1px solid ${T.goldBorder}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, color: T.gold, fontFamily: "'Cinzel', serif",
            }}>
              {initials(user || "PPC")}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: T.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 128 }}>{user || "PPC User"}</p>
              <p style={{ margin: 0, fontSize: 8, color: T.muted, letterSpacing: "0.12em" }}>PPC · ACTIVE</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              width: "100%", padding: "8px", borderRadius: 3, cursor: "pointer",
              background: "transparent", border: `1px solid ${T.subtle}`,
              color: T.muted, fontSize: 10, letterSpacing: "0.12em",
              fontFamily: "'Cinzel', serif", transition: "all .15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.color = T.red; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.subtle; e.currentTarget.style.color = T.muted; }}
          >SIGN OUT</button>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════════════
          MAIN CONTENT
      ═══════════════════════════════════════════════════════════════ */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Top bar */}
        <header style={{
          padding: isMobile ? "13px 16px" : "13px 28px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          borderBottom: `1px solid ${T.goldBorder}`,
          background: T.bgSide, position: "sticky", top: 0, zIndex: 100,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Hamburger — mobile only */}
            {isMobile && (
              <button
                onClick={() => setSidebarOpen(v => !v)}
                style={{
                  background: "transparent", border: `1px solid ${T.subtle}`,
                  color: T.gold, cursor: "pointer", padding: "6px 9px",
                  borderRadius: 3, fontSize: 16, lineHeight: 1, transition: "all .15s",
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = T.gold}
                onMouseLeave={e => e.currentTarget.style.borderColor = T.subtle}
                aria-label="Toggle navigation"
              >{sidebarOpen ? "✕" : "☰"}</button>
            )}
            <div>
              <p style={{ margin: 0, fontSize: 8, letterSpacing: "0.24em", color: T.gold, fontFamily: "'Cinzel', serif" }}>— ADMIN PANEL</p>
              <h1 style={{ margin: "2px 0 0", fontSize: isMobile ? 17 : 22, fontWeight: 600, color: T.white, fontFamily: "'Cinzel', serif", letterSpacing: "0.02em", lineHeight: 1.1 }}>
                {activeSection === "create" ? "Create Campaign" : "My Campaigns"}
              </h1>
            </div>
          </div>

          {/* Bell notification */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowNotifs(v => !v)}
              style={{
                width: 36, height: 36, borderRadius: 3,
                background: showNotifs ? T.goldDim : "transparent",
                border: `1px solid ${showNotifs ? T.goldBorder : T.subtle}`,
                color: showNotifs ? T.gold : T.muted,
                cursor: "pointer", fontSize: 14,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all .15s", position: "relative",
              }}
              onMouseEnter={e => { if (!showNotifs) { e.currentTarget.style.borderColor = T.goldBorder; e.currentTarget.style.color = T.gold; } }}
              onMouseLeave={e => { if (!showNotifs) { e.currentTarget.style.borderColor = T.subtle; e.currentTarget.style.color = T.muted; } }}
              aria-label="Notifications"
            >
              ◉
              {unread > 0 && (
                <span style={{
                  position: "absolute", top: 5, right: 5,
                  width: 7, height: 7, borderRadius: "50%",
                  background: T.red, border: `1.5px solid ${T.bgSide}`,
                }} />
              )}
            </button>
            <NotifPanel open={showNotifs} onClose={() => setShowNotifs(false)} />
          </div>
        </header>

        {/* Page error */}
        {pageError && (
          <div style={{
            margin: "16px 28px 0", padding: "10px 14px",
            background: T.redBg, border: `1px solid ${T.red}44`,
            borderRadius: 3, color: T.red, fontSize: 12,
            fontFamily: "'DM Sans', sans-serif",
          }}>{pageError}</div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            MY CAMPAIGNS SECTION
        ═══════════════════════════════════════════════════════════ */}
        {activeSection === "campaigns" && (
          <div style={{ padding: isMobile ? "16px 14px" : "22px 28px", flex: 1 }}>

            {/* ── Status filter cards ─────────────────────────────────── */}
            <div style={{ marginBottom: 20 }}>
              {/* Mobile: "FILTER" toggle button */}
              {isMobile && (
                <button
                  onClick={() => setFiltersOpen(v => !v)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8, marginBottom: filtersOpen ? 12 : 0,
                    padding: "7px 13px", borderRadius: 3, cursor: "pointer",
                    background: filtersOpen ? T.goldDim : "transparent",
                    border: `1px solid ${filtersOpen ? T.gold : T.subtle}`,
                    color: filtersOpen ? T.gold : T.muted,
                    fontSize: 9, letterSpacing: "0.16em",
                    fontFamily: "'Cinzel', serif", transition: "all .15s",
                  }}
                >
                  ◈ {statusFilter ? FILTER_CARDS.find(f => f.id === statusFilter)?.label.toUpperCase() : "FILTER BY STATUS"} {filtersOpen ? "▲" : "▼"}
                </button>
              )}

              {/* Cards row — always visible on desktop, toggle on mobile */}
              {(!isMobile || filtersOpen) && (
                <div style={{
                  display: "flex", gap: 10,
                  overflowX: isMobile ? "auto" : "unset",
                  flexWrap: isMobile ? "nowrap" : "wrap",
                  paddingBottom: isMobile ? 4 : 0,
                  animation: "opsFadeUp .22s ease",
                }}>
                  {FILTER_CARDS.map(card => {
                    const active = statusFilter === card.id;
                    const count  = stats[card.id] ?? 0;
                    return (
                      <div
                        key={card.id}
                        className="ops-fcard"
                        onClick={() => handleFilterClick(card.id)}
                        style={{
                          flex: isMobile ? "0 0 130px" : "1 1 0",
                          minWidth: isMobile ? 130 : 110,
                          padding: "16px 16px 14px",
                          borderRadius: 4,
                          background: active ? card.bg : T.bgCard,
                          border: `1px solid ${active ? card.color : T.goldBorder}`,
                          cursor: "pointer", userSelect: "none",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: card.color, flexShrink: 0 }} />
                          <span style={{
                            fontSize: 8, fontWeight: 700, letterSpacing: "0.18em",
                            color: active ? card.color : T.muted,
                            fontFamily: "'Cinzel', serif", transition: "color .18s",
                          }}>{card.label.toUpperCase()}</span>
                        </div>
                        <div style={{ fontSize: 30, fontWeight: 700, color: active ? card.color : T.white, fontFamily: "'Cinzel', serif", lineHeight: 1 }}>
                          {count}
                        </div>
                        <div style={{ fontSize: 9, color: T.muted, marginTop: 5, letterSpacing: "0.06em" }}>campaigns</div>
                        {active && (
                          <div style={{ marginTop: 8, fontSize: 8, color: card.color, letterSpacing: "0.1em", fontFamily: "'Cinzel', serif" }}>
                            ● FILTERING
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Process Manager View table ──────────────────────────── */}
            <div style={{
              background: T.bgCard, border: `1px solid ${T.goldBorder}`,
              borderRadius: 4, overflow: "hidden",
              animation: "opsFadeUp .28s .05s ease both",
            }}>
              {/* Toolbar */}
              <div style={{
                padding: "13px 18px",
                display: "flex", alignItems: "center",
                justifyContent: "space-between", gap: 10, flexWrap: "wrap",
                borderBottom: `1px solid ${T.subtle}`,
                background: `${T.bg}cc`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.2em", color: T.gold, fontFamily: "'Cinzel', serif" }}>
                    PROCESS MANAGER VIEW
                  </span>
                  <span style={{
                    padding: "2px 9px", borderRadius: 2,
                    background: T.goldDim, border: `1px solid ${T.goldBorder}`,
                    fontSize: 9, color: T.gold, fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {filtered.length} records
                  </span>
                  {statusFilter && (
                    <button
                      onClick={() => setStatusFilter(null)}
                      style={{
                        background: "transparent", border: `1px solid ${T.subtle}`,
                        color: T.muted, fontSize: 9, cursor: "pointer",
                        padding: "2px 8px", borderRadius: 2, fontFamily: "'DM Sans', sans-serif",
                        transition: "all .15s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = T.red; e.currentTarget.style.borderColor = T.red; }}
                      onMouseLeave={e => { e.currentTarget.style.color = T.muted; e.currentTarget.style.borderColor = T.subtle; }}
                    >✕ Clear filter</button>
                  )}
                </div>

                {/* Search — always visible, never hidden */}
                <div style={{ position: "relative", flexShrink: 0, width: isMobile ? "100%" : "auto" }}>
                  <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.muted, fontSize: 13, pointerEvents: "none" }}>⌕</span>
                  <input
                    className="ops-focus"
                    type="text"
                    placeholder="Search campaigns…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{ ...inputSx, paddingLeft: 32, height: 34, width: isMobile ? "100%" : 210, fontSize: 12, borderRadius: 3 }}
                  />
                </div>
              </div>

              {/* Table */}
              {loading ? (
                <div style={{ padding: "52px 20px", textAlign: "center", color: T.muted, fontSize: 13 }}>
                  <div style={{ marginBottom: 10, color: T.gold, fontSize: 22 }}>◈</div>
                  Loading campaigns…
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: "52px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 24, color: T.subtle, marginBottom: 12, fontFamily: "'Cinzel', serif" }}>◇</div>
                  <p style={{ margin: 0, fontSize: 14, color: T.white, fontFamily: "'Cinzel', serif", letterSpacing: "0.04em" }}>No Records Found</p>
                  <p style={{ margin: "8px 0 20px", fontSize: 13, color: T.muted }}>
                    {searchQuery || statusFilter ? "Try adjusting your search or filter." : "Create your first campaign to get started."}
                  </p>
                  {!searchQuery && !statusFilter && (
                    <GoldBtn onClick={() => goTo("create")} variant="outline">CREATE CAMPAIGN</GoldBtn>
                  )}
                </div>
              ) : (
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${T.subtle}`, background: `${T.bg}dd` }}>
                        {["TIMESTAMP", "PPC MESSAGE", "PM COMMENT", "STATUS", "PM ACTION", "REQUESTED TIME", "IT COMMENT", "TICKET STATE"].map(h => (
                          <th key={h} style={{
                            padding: "10px 16px", textAlign: "left",
                            fontSize: 9, fontWeight: 600, color: T.gold,
                            letterSpacing: "0.16em", fontFamily: "'Cinzel', serif",
                            whiteSpace: "nowrap",
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c, i) => (
                        <tr
                          key={c._id}
                          className="ops-row"
                          style={{
                            borderBottom: `1px solid ${T.subtle}22`,
                            background: i % 2 === 1 ? `${T.bgCard}88` : "transparent",
                            transition: "background .12s",
                          }}
                        >
                          {/* TIMESTAMP */}
                          <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                            <span style={{ fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>
                              {fmt(c.createdAt)}
                            </span>
                          </td>

                          {/* PPC MESSAGE — full text, no truncation */}
                          <td style={{ padding: "12px 16px", minWidth: 180, maxWidth: 260 }}>
                            <p style={{
                              margin: 0, fontSize: 12, color: T.text, lineHeight: 1.55,
                              wordBreak: "break-word", whiteSpace: "pre-wrap",
                            }}>{c.message}</p>
                          </td>

                          {/* PM COMMENT — full text */}
                          <td style={{ padding: "12px 16px", minWidth: 160, maxWidth: 240 }}>
                            {c.pmMessage ? (
                              <p style={{
                                margin: 0, fontSize: 12, color: T.muted, lineHeight: 1.55,
                                fontStyle: "italic", wordBreak: "break-word", whiteSpace: "pre-wrap",
                              }}>{c.pmMessage}</p>
                            ) : (
                              <span style={{ fontSize: 11, color: T.subtle, fontFamily: "'JetBrains Mono', monospace" }}>—</span>
                            )}
                          </td>

                          {/* STATUS — PPC-controlled */}
                          <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                            <StatusBadge value={c.status} meta={STATUS_META} />
                          </td>

                          {/* PM ACTION */}
                          <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                            {c.action
                              ? <StatusBadge value={c.action} meta={ACTION_META} />
                              : <span className="ops-pending" style={{
                                  display: "inline-flex", alignItems: "center", gap: 5,
                                  padding: "3px 9px", borderRadius: 2,
                                  background: "rgba(122,112,96,0.11)", color: T.muted,
                                  fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
                                  fontFamily: "'Cinzel', serif", whiteSpace: "nowrap",
                                  border: `1px solid ${T.muted}33`,
                                }}>PENDING</span>
                            }
                          </td>

                          {/* REQUESTED TIME — combined date + time from requestedAt */}
                          <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                            <span style={{ fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>
                              {fmt(c.requestedAt)}
                            </span>
                          </td>

                          {/* IT COMMENT — full text */}
                          <td style={{ padding: "12px 16px", minWidth: 140, maxWidth: 220 }}>
                            {c.itMessage ? (
                              <span style={{
                                fontSize: 11, color: T.teal, fontStyle: "italic",
                                wordBreak: "break-word", whiteSpace: "pre-wrap",
                                display: "block",
                              }}>
                                {c.itMessage}
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, color: T.subtle, fontFamily: "'JetBrains Mono', monospace" }}>—</span>
                            )}
                          </td>

                          {/* TICKET STATE — UPDATE button or status label */}
                          <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                            {c.status === "transfer" ? (
                              /* UPDATE button — only clickable when campaign is in "transfer" status */
                              <button
                                className="ops-upd"
                                onClick={() => setUpdateTarget(c)}
                                style={{
                                  padding: "4px 12px", borderRadius: 2,
                                  background: T.amberBg, border: `1px solid ${T.amber}44`,
                                  color: T.amber, fontSize: 9, fontWeight: 700,
                                  letterSpacing: "0.12em", cursor: "pointer",
                                  fontFamily: "'Cinzel', serif", transition: "all .15s",
                                }}
                              >UPDATE</button>
                            ) : (
                              /* Read-only label for closed/cancelled campaigns */
                              <span style={{
                                fontSize: 9, letterSpacing: "0.12em", fontWeight: 700,
                                color: c.status === "cancel" ? T.red : T.green,
                                fontFamily: "'Cinzel', serif",
                              }}>
                                {c.status === "cancel" ? "CANCELLED" : "CLOSED"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Table footer */}
              {!loading && filtered.length > 0 && (
                <div style={{
                  padding: "9px 18px", borderTop: `1px solid ${T.subtle}22`,
                  display: "flex", justifyContent: "space-between",
                  background: `${T.bg}aa`,
                }}>
                  <span style={{ fontSize: 9, color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>
                    {filtered.length} of {campaigns.length} campaigns
                  </span>
                  <span style={{ fontSize: 9, color: T.subtle, fontFamily: "'JetBrains Mono', monospace" }}>
                    LIVE UPDATES ACTIVE
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            CREATE CAMPAIGN SECTION (matches Create User page style)
        ═══════════════════════════════════════════════════════════ */}
        {activeSection === "create" && (
          <div style={{ padding: isMobile ? "16px 14px" : "22px 28px", flex: 1 }}>
            <div style={{ maxWidth: 560 }}>

              {/* Info banner */}
              <div style={{
                padding: "14px 18px", marginBottom: 22,
                border: `1px solid ${T.goldBorder}`, borderRadius: 4,
                background: T.bgCard,
                animation: "opsFadeUp .22s ease",
              }}>
                <p style={{ margin: 0, fontSize: 12, color: T.muted, lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif" }}>
                  Fill in the details below to submit a new campaign request. The Process Manager will review and take action after submission.
                </p>
              </div>

              {/* Form card */}
              <div style={{
                background: T.bgCard,
                border: `1px solid ${T.goldBorder}`,
                borderRadius: 4, padding: isMobile ? "22px 18px" : "28px 26px 24px",
                animation: "opsFadeUp .28s .05s ease both",
              }}>
                <h2 style={{ margin: "0 0 22px", fontSize: 15, fontWeight: 600, color: T.white, fontFamily: "'Cinzel', serif", letterSpacing: "0.08em" }}>
                  Create Campaign
                </h2>

                {createError && (
                  <div style={{
                    padding: "10px 14px", borderRadius: 3, marginBottom: 18,
                    background: T.redBg, border: `1px solid ${T.red}44`,
                    color: T.red, fontSize: 12, fontFamily: "'DM Sans', sans-serif",
                  }}>{createError}</div>
                )}

                {createOk && (
                  <div style={{
                    padding: "10px 14px", borderRadius: 3, marginBottom: 18,
                    background: T.greenBg, border: `1px solid ${T.green}44`,
                    color: T.green, fontSize: 11, fontFamily: "'Cinzel', serif", letterSpacing: "0.08em",
                  }}>✓ CAMPAIGN CREATED — Redirecting…</div>
                )}

                <form onSubmit={handleCreate}>
                  {/* MESSAGE */}
                  <Field label="MESSAGE" hint="required">
                    <textarea
                      className="ops-focus"
                      value={createForm.message}
                      onChange={e => setCreateForm(f => ({ ...f, message: e.target.value }))}
                      placeholder="Describe the campaign request in detail…"
                      rows={4}
                      required
                      style={{ ...inputSx, resize: "vertical", lineHeight: 1.6 }}
                    />
                  </Field>

                  {/* REQUESTED DATE / TIME */}
                  <Field label="REQUESTED DATE / TIME" hint="optional — defaults to now">
                    <input
                      type="datetime-local"
                      className="ops-focus"
                      value={createForm.requestedAt}
                      onChange={e => setCreateForm(f => ({ ...f, requestedAt: e.target.value }))}
                      style={{ ...inputSx, colorScheme: "dark" }}
                    />
                  </Field>

                  {/* TEAM ID — shown only if not auto-detected from existing campaigns */}
                  {!teamId && (
                    <Field label="TEAM ID" hint="required — ask your manager">
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          className="ops-focus"
                          value={teamIdInput}
                          onChange={e => setTeamIdInput(e.target.value)}
                          placeholder="e.g. 6647b3f2a4c…"
                          style={{ ...inputSx, flex: 1 }}
                        />
                        <button
                          type="button"
                          onClick={saveTeamId}
                          style={{
                            padding: "0 16px", borderRadius: 3, whiteSpace: "nowrap",
                            background: T.goldDim, border: `1px solid ${T.goldBorder}`,
                            color: T.gold, fontSize: 10, cursor: "pointer",
                            fontFamily: "'Cinzel', serif", letterSpacing: "0.1em",
                            transition: "all .15s",
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = "rgba(201,164,42,.22)"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = T.goldDim; }}
                        >SAVE</button>
                      </div>
                    </Field>
                  )}

                  {/* Team ID detected display */}
                  {teamId && (
                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 12px", background: T.bgInput,
                      border: `1px solid ${T.subtle}`, borderRadius: 3, marginBottom: 20,
                    }}>
                      <span style={{ fontSize: 9, color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>
                        TEAM — {teamId.slice(0, 16)}…
                      </span>
                      <button
                        type="button"
                        onClick={() => { setTeamId(""); localStorage.removeItem("ops_ppc_team_id"); }}
                        style={{ background: "none", border: "none", color: T.muted, fontSize: 10, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "color .15s" }}
                        onMouseEnter={e => e.currentTarget.style.color = T.red}
                        onMouseLeave={e => e.currentTarget.style.color = T.muted}
                      >Change</button>
                    </div>
                  )}

                  {/* Submit */}
                  <div style={{ borderTop: `1px solid ${T.subtle}`, paddingTop: 20, marginTop: 6 }}>
                    <GoldBtn type="submit" disabled={creating} style={{ width: "100%", padding: "13px" }}>
                      {creating ? "CREATING…" : "CREATE CAMPAIGN"}
                    </GoldBtn>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Update Modal ─────────────────────────────────────────────────── */}
      {updateTarget && (
        <UpdateModal
          campaign={updateTarget}
          onClose={() => setUpdateTarget(null)}
          onSave={handleUpdate}
        />
      )}
    </div>
  );
}