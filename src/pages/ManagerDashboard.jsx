/**
 * ManagerDashboard.jsx — OPS SUITE Manager Panel
 * ─────────────────────────────────────────────────────────────────────────────
 * Sections:
 *   • Campaigns    — all team campaigns, filter / search, update modal
 *   • Create       — submit new campaign (teamId auto-resolved from /team/my)
 *   • Team Members — PPC users list + create + delete
 *
 * Backend endpoints consumed:
 *   GET  /api/v1/team/my            ← NEW: returns teamId + populated members
 *   GET  /api/v1/campaign/get       → all team campaigns (manager scope)
 *   POST /api/v1/campaign/create    → { message, requestedAt, teamId }
 *   POST /api/v1/campaign/update    → { campaignId, message, status, requestedAt }
 *   POST /api/v1/user/create        → { username, email, password, role:"ppc" }
 *   POST /api/v1/user/delete        → { id }
 *
 * Socket events (server emits to room:team_<teamId> + room:all_pm):
 *   campaign:created  → prepend to store, notify
 *   campaign:updated  → patch store, notify
 *   campaign:it_queued → patch store, notify
 *   campaign:it_ack   → patch store, notify
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import useCampaignStore from "../stores/useCampaignStore.js";
import useAuthStore     from "../stores/useAuthStore.js";
import useNotifStore    from "../stores/useNotificationStore.js";
import api              from "../api/axios.js";

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
  purple:     "#a78bfa",
  purpleBg:   "rgba(167,139,250,0.11)",
  sideW:      224,
};

/* ─── Status / Action metadata ───────────────────────────────────────────── */
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

/* Status filter cards — one set only (inside table toolbar) */
const FILTER_CARDS = [
  { id: "transfer", label: "In Review",  color: T.blue,  bg: T.blueBg  },
  { id: "approve",  label: "Approved",   color: T.teal,  bg: T.tealBg  },
  { id: "done",     label: "Done",       color: T.green, bg: T.greenBg },
  { id: "cancel",   label: "Cancelled",  color: T.red,   bg: T.redBg   },
  { id: "not done", label: "Not Done",   color: T.amber, bg: T.amberBg },
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

const initials = (n = "") =>
  n.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("") || "M";

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
      display: "inline-flex", alignItems: "center",
      padding: "3px 9px", borderRadius: 2,
      background: m.bg, color: m.color,
      fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
      fontFamily: "'Cinzel', serif", whiteSpace: "nowrap",
      border: `1px solid ${m.color}33`,
    }}>{m.label}</span>
  );
}

/* ─── GoldBtn ────────────────────────────────────────────────────────────── */
function GoldBtn({ children, onClick, disabled, style = {}, type = "button", variant = "fill" }) {
  const [hov, setHov] = useState(false);
  const [act, setAct] = useState(false);
  return (
    <button
      type={type} onClick={onClick} disabled={disabled}
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
    >{children}</button>
  );
}

/* ─── Shared input style ─────────────────────────────────────────────────── */
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
        {hint && (
          <span style={{ color: T.muted, fontWeight: 400, fontSize: 9, letterSpacing: "0.06em", fontFamily: "'DM Sans', sans-serif", marginLeft: 6 }}>
            ({hint})
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   UPDATE MODAL  (Manager / PPC — edit message + date OR cancel)
═══════════════════════════════════════════════════════════════════════════ */
function UpdateModal({ campaign, onClose, onSave }) {
  const [status,      setStatus]      = useState("transfer");
  const [message,     setMessage]     = useState(campaign?.message || "");
  const [requestedAt, setRequestedAt] = useState(campaign?.requestedAt?.slice?.(0, 16) || "");
  const [busy,        setBusy]        = useState(false);
  const [err,         setErr]         = useState("");

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  if (!campaign) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (status === "transfer" && !message.trim()) {
      setErr("Message is required.");
      return;
    }
    setErr("");
    setBusy(true);
    try {
      await onSave(campaign._id, {
        message:     status === "transfer" ? message.trim() : campaign.message,
        status,
        requestedAt: status === "transfer" ? (requestedAt || undefined) : undefined,
      });
      onClose();
    } catch (ex) {
      setErr(ex?.response?.data?.message || "Update failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.80)",
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
              Edit Request
            </h3>
          </div>
          <button onClick={onClose}
            style={{
              background: "transparent", border: `1px solid ${T.subtle}`,
              color: T.muted, cursor: "pointer",
              width: 28, height: 28, borderRadius: 2, fontSize: 13,
              display: "flex", alignItems: "center", justifyContent: "center",
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
          <p style={{ margin: 0, fontSize: 9, letterSpacing: "0.12em", color: T.muted, fontFamily: "'Cinzel', serif", marginBottom: 4 }}>CURRENT MESSAGE</p>
          <p style={{ margin: 0, fontSize: 12, color: T.text, lineHeight: 1.5 }}>{campaign.message}</p>
        </div>

        {err && (
          <div style={{
            padding: "9px 13px", background: T.redBg,
            border: `1px solid ${T.red}44`, borderRadius: 3, color: T.red,
            fontSize: 12, marginBottom: 16,
          }}>{err}</div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Action toggle */}
          <Field label="ACTION">
            <div style={{ display: "flex", gap: 10 }}>
              {[
                { val: "transfer", label: "EDIT",   desc: "Update & keep active" },
                { val: "cancel",   label: "CANCEL",  desc: "Cancel this campaign" },
              ].map(({ val, label, desc }) => {
                const isActive = status === val;
                const isCancel = val === "cancel";
                return (
                  <button key={val} type="button" onClick={() => setStatus(val)}
                    style={{
                      flex: 1, padding: "11px 10px", borderRadius: 3, cursor: "pointer",
                      background: isActive ? (isCancel ? T.redBg : T.goldDim) : T.bgInput,
                      border: `1px solid ${isActive ? (isCancel ? T.red : T.gold) : T.subtle}`,
                      color: isActive ? (isCancel ? T.red : T.gold) : T.muted,
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", fontFamily: "'Cinzel', serif", marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 10, opacity: 0.7, fontFamily: "'DM Sans', sans-serif" }}>{desc}</div>
                  </button>
                );
              })}
            </div>
          </Field>

          {status === "transfer" && (
            <>
              <Field label="MESSAGE" hint="required">
                <textarea className="ops-focus" value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Describe the campaign request…" rows={3} required
                  style={{ ...inputSx, resize: "vertical", lineHeight: 1.6 }}
                />
              </Field>
              <Field label="REQUESTED DATE / TIME" hint="optional">
                <input type="datetime-local" className="ops-focus"
                  value={requestedAt} onChange={e => setRequestedAt(e.target.value)}
                  style={{ ...inputSx, colorScheme: "dark" }}
                />
              </Field>
            </>
          )}

          {status === "cancel" && (
            <div style={{
              padding: "11px 14px", background: T.redBg,
              border: `1px solid ${T.red}33`, borderRadius: 3, marginBottom: 18,
            }}>
              <p style={{ margin: 0, fontSize: 12, color: "#f09090", lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif" }}>
                ⚠ This will permanently <strong style={{ color: T.red }}>CANCEL</strong> this campaign. This action cannot be undone.
              </p>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button type="button" onClick={onClose}
              style={{
                flex: 1, padding: "11px", borderRadius: 3, cursor: "pointer",
                background: "transparent", border: `1px solid ${T.subtle}`,
                color: T.muted, fontSize: 11, letterSpacing: "0.1em",
                fontFamily: "'Cinzel', serif", transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.goldBorder; e.currentTarget.style.color = T.gold; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.subtle; e.currentTarget.style.color = T.muted; }}
            >DISCARD</button>

            <button type="submit" disabled={busy}
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
            >
              {busy ? "SAVING…" : status === "cancel" ? "CONFIRM CANCEL" : "SAVE CHANGES"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DELETE USER MODAL
═══════════════════════════════════════════════════════════════════════════ */
function DeleteUserModal({ target, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  if (!target) return null;

  const handle = async () => {
    setBusy(true); setErr("");
    try {
      await onConfirm(target._id);
      onClose();
    } catch (ex) {
      setErr(ex?.response?.data?.message || "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.82)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div style={{
        background: T.bgCard, border: `1px solid ${T.red}44`,
        borderRadius: 4, padding: "28px 26px 24px",
        width: "100%", maxWidth: 400,
        animation: "opsIn 0.22s cubic-bezier(.22,1,.36,1)",
      }}>
        <div style={{ marginBottom: 18 }}>
          <p style={{ margin: 0, fontSize: 8, letterSpacing: "0.22em", color: T.red, fontFamily: "'Cinzel', serif" }}>— DANGER ZONE</p>
          <h3 style={{ margin: "4px 0 0", fontSize: 17, fontWeight: 600, color: T.white, fontFamily: "'Cinzel', serif" }}>Remove PPC Member</h3>
        </div>

        <div style={{
          padding: "12px 14px", background: T.bgInput,
          border: `1px solid ${T.subtle}`, borderRadius: 3, marginBottom: 16,
        }}>
          <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 500, color: T.text, fontFamily: "'Cinzel', serif" }}>{target.username}</p>
          <p style={{ margin: 0, fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>{target.email}</p>
        </div>

        <div style={{
          padding: "10px 14px", background: T.redBg,
          border: `1px solid ${T.red}33`, borderRadius: 3, marginBottom: 18,
        }}>
          <p style={{ margin: 0, fontSize: 12, color: "#f09090", lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif" }}>
            ⚠ This action is <strong style={{ color: T.red }}>permanent</strong>. The user will be removed from the team and cannot log in.
          </p>
        </div>

        {err && (
          <div style={{ padding: "9px 13px", background: T.redBg, borderRadius: 3, color: T.red, fontSize: 12, marginBottom: 14 }}>{err}</div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onClose}
            style={{
              flex: 1, padding: "11px", borderRadius: 3, cursor: "pointer",
              background: "transparent", border: `1px solid ${T.subtle}`,
              color: T.muted, fontSize: 11, letterSpacing: "0.1em",
              fontFamily: "'Cinzel', serif", transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = T.goldBorder; e.currentTarget.style.color = T.gold; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.subtle; e.currentTarget.style.color = T.muted; }}
          >CANCEL</button>
          <button type="button" onClick={handle} disabled={busy}
            style={{
              flex: 2, padding: "11px", borderRadius: 3,
              cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1,
              background: T.redBg, border: `1px solid ${T.red}66`,
              color: T.red, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
              fontFamily: "'Cinzel', serif", transition: "all 0.15s",
            }}
            onMouseEnter={e => { if (!busy) e.currentTarget.style.background = "rgba(224,82,82,0.22)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = T.redBg; }}
          >{busy ? "REMOVING…" : "CONFIRM REMOVE"}</button>
        </div>
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
      position: "absolute", top: 46, right: 0, width: 300, zIndex: 600,
      background: T.bgCard, border: `1px solid ${T.goldBorder}`,
      borderRadius: 4, overflow: "hidden",
      boxShadow: "0 16px 48px rgba(0,0,0,.7)",
    }}>
      <div style={{
        padding: "11px 16px", borderBottom: `1px solid ${T.subtle}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.18em", color: T.gold, fontFamily: "'Cinzel', serif" }}>NOTIFICATIONS</span>
        <button onClick={clearNotifs} style={{ background: "none", border: "none", color: T.muted, fontSize: 11, cursor: "pointer" }}>Clear all</button>
      </div>
      <div style={{ maxHeight: 300, overflowY: "auto" }}>
        {notifications.length === 0 ? (
          <p style={{ padding: "18px 16px", textAlign: "center", color: T.muted, fontSize: 12, margin: 0 }}>No notifications</p>
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
export default function ManagerDashboard() {
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
  const [loading,       setLoading]       = useState(true);
  const [pageError,     setPageError]     = useState("");
  const [activeSection, setActiveSection] = useState("campaigns");
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [showNotifs,    setShowNotifs]    = useState(false);
  const [updateTarget,  setUpdateTarget]  = useState(null);
  const [deleteTarget,  setDeleteTarget]  = useState(null);
  const [statusFilter,  setStatusFilter]  = useState(null);
  const [searchQuery,   setSearchQuery]   = useState("");

  /* ── Team state ──────────────────────────────────────────────────────── */
  // teamInfo: { _id, teamName, managerId, members: [{_id, username, email, role}] }
  const [teamInfo,     setTeamInfo]     = useState(null);
  const [teamLoading,  setTeamLoading]  = useState(false);

  /* ── Create campaign form ────────────────────────────────────────────── */
  const [createForm,  setCreateForm]  = useState({ message: "", requestedAt: "" });
  const [creating,    setCreating]    = useState(false);
  const [createError, setCreateError] = useState("");
  const [createOk,    setCreateOk]    = useState(false);

  /* ── Create user form ────────────────────────────────────────────────── */
  const [userForm,     setUserForm]     = useState({ username: "", email: "", password: "" });
  const [creatingUser, setCreatingUser] = useState(false);
  const [userError,    setUserError]    = useState("");
  const [userOk,       setUserOk]       = useState(false);

  /* ── Responsive ──────────────────────────────────────────────────────── */
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const cb = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", cb);
    return () => window.removeEventListener("resize", cb);
  }, []);

  /* ─────────────────────────────────────────────────────────────────────
     LOAD TEAM INFO — GET /api/v1/team/my
     Returns { _id (teamId), teamName, managerId, members[] }
     This is the single source of truth for teamId and PPC user list.
  ────────────────────────────────────────────────────────────────────── */
  const loadTeamInfo = useCallback(async () => {
    setTeamLoading(true);
    try {
      const res = await api.get("/team/my");
      setTeamInfo(res.data?.data ?? null);
    } catch (err) {
      // Graceful fallback: extract teamId from already-loaded campaigns
      console.warn("GET /team/my failed:", err?.response?.status);
    } finally {
      setTeamLoading(false);
    }
  }, []);

  /* ─────────────────────────────────────────────────────────────────────
     ON MOUNT: load campaigns + team info in parallel
  ────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      try {
        await Promise.all([
          getCampaign(),
          loadTeamInfo(),
        ]);
      } catch (err) {
        setPageError("Failed to load data. Please refresh.");
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line

  /* ─────────────────────────────────────────────────────────────────────
     Derived teamId — prefer team endpoint, fall back to campaign data
  ────────────────────────────────────────────────────────────────────── */
  const teamId = useMemo(() => {
    if (teamInfo?._id) return teamInfo._id;
    // Fallback: extract from first available campaign
    const first = campaigns[0];
    if (!first) return null;
    const raw = first.teamId;
    return (typeof raw === "object" ? raw?._id : raw) || null;
  }, [teamInfo, campaigns]);

  /* ─────────────────────────────────────────────────────────────────────
     PPC MEMBERS — from team.members (excludes the manager themselves)
  ────────────────────────────────────────────────────────────────────── */
  const ppcMembers = useMemo(() => {
    if (!teamInfo?.members) return [];
    return teamInfo.members.filter(m => m.role === "ppc");
  }, [teamInfo]);

  /* ─────────────────────────────────────────────────────────────────────
     SOCKET — real-time campaign events scoped to this team
     Server emits to: room:team_<teamId>  +  room:all_pm
     So only team members and PMs receive these events.
  ────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const socket = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:3000", {
      withCredentials: true,  // sends httpOnly cookie → server authenticates
    });

    socket.on("campaign:created", (c) => {
      useCampaignStore.setState(s => ({ campaigns: [c, ...s.campaigns] }));
      addNotification(`New campaign submitted`);
    });

    socket.on("campaign:updated", (c) => {
      useCampaignStore.setState(s => ({
        campaigns: s.campaigns.map(x => x._id === c._id ? c : x),
      }));
      addNotification("Campaign updated");
    });

    socket.on("campaign:it_queued", (c) => {
      useCampaignStore.setState(s => ({
        campaigns: s.campaigns.map(x => x._id === c._id ? c : x),
      }));
      addNotification("Campaign approved — forwarded to IT");
    });

    socket.on("campaign:it_ack", (c) => {
      useCampaignStore.setState(s => ({
        campaigns: s.campaigns.map(x => x._id === c._id ? c : x),
      }));
      addNotification(`IT acknowledged: ${c.itMessage?.slice(0, 40) || ""}`);
    });

    return () => socket.disconnect();
  }, [addNotification]);

  /* ─────────────────────────────────────────────────────────────────────
     DERIVED STATS + FILTERED LIST
  ────────────────────────────────────────────────────────────────────── */
  const stats = useMemo(() => ({
    transfer:  campaigns.filter(c => c.status  === "transfer").length,
    approve:   campaigns.filter(c => c.action  === "approve").length,
    done:      campaigns.filter(c => c.status  === "done").length,
    cancel:    campaigns.filter(c => c.status  === "cancel").length,
    "not done":campaigns.filter(c => c.status  === "not done").length,
  }), [campaigns]);

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

  /* ─────────────────────────────────────────────────────────────────────
     HANDLERS
  ────────────────────────────────────────────────────────────────────── */
  const handleLogout = useCallback(async () => {
    await logout();
    navigate("/login");
  }, [logout, navigate]);

  const goTo = (section) => {
    setActiveSection(section);
    setSidebarOpen(false);
    setCreateError(""); setCreateOk(false);
    setUserError("");   setUserOk(false);
  };

  /* POST /api/v1/campaign/create */
  const handleCreate = useCallback(async (e) => {
    e.preventDefault();
    setCreateError(""); setCreateOk(false);

    if (!teamId) {
      setCreateError("Team not found. Please wait or refresh — your team may still be loading.");
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
        teamId,
      });
      setCreateForm({ message: "", requestedAt: "" });
      setCreateOk(true);
      addNotification("Campaign created successfully");
      setTimeout(() => { setActiveSection("campaigns"); setCreateOk(false); }, 1800);
    } catch (err) {
      setCreateError(err?.response?.data?.message || "Failed to create campaign.");
    } finally {
      setCreating(false);
    }
  }, [teamId, createForm, createCampaign, addNotification]);

  /* POST /api/v1/campaign/update */
  const handleUpdate = useCallback(async (campaignId, data) => {
    await updateCampaign(campaignId, data);
    addNotification(data.status === "cancel" ? "Campaign cancelled" : "Campaign updated");
  }, [updateCampaign, addNotification]);

  /* POST /api/v1/user/create  (role always "ppc" for managers) */
  const handleCreateUser = useCallback(async (e) => {
    e.preventDefault();
    setUserError(""); setUserOk(false);
    if (!userForm.username.trim() || !userForm.email.trim() || !userForm.password) {
      setUserError("All fields are required.");
      return;
    }
    setCreatingUser(true);
    try {
      await api.post("/user/create", { ...userForm, role: "ppc" });
      setUserForm({ username: "", email: "", password: "" });
      setUserOk(true);
      addNotification(`PPC user "${userForm.username}" created`);
      // Refresh team info so the new member appears in the list
      await loadTeamInfo();
      setTimeout(() => setUserOk(false), 3000);
    } catch (err) {
      setUserError(err?.response?.data?.message || "Failed to create user.");
    } finally {
      setCreatingUser(false);
    }
  }, [userForm, addNotification, loadTeamInfo]);

  /* POST /api/v1/user/delete */
  const handleDeleteUser = useCallback(async (userId) => {
    await api.post("/user/delete", { id: userId });
    addNotification("PPC user removed from team");
    // Refresh team to update member list
    await loadTeamInfo();
  }, [addNotification, loadTeamInfo]);

  /* ─────────────────────────────────────────────────────────────────────
     RENDER
  ────────────────────────────────────────────────────────────────────── */
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'DM Sans', sans-serif" }}>

      {/* Global CSS */}
      <style>{`
        @keyframes opsIn     { from { opacity:0; transform:translateY(14px) scale(.97); } to { opacity:1; transform:none; } }
        @keyframes opsFadeUp { from { opacity:0; transform:translateY(8px); }           to { opacity:1; transform:none; } }
        @keyframes opsPulse  { 0%,100%{opacity:.6} 50%{opacity:1} }
        .ops-focus:focus   { border-color:${T.gold} !important; box-shadow:0 0 0 3px ${T.goldDim}; outline:none; }
        .ops-row           { cursor:default; transition:background .12s, box-shadow .12s; }
        .ops-row:hover     { background:${T.bgRow} !important; box-shadow:inset 3px 0 0 ${T.gold}55; }
        .ops-nav-btn       { transition:all .15s !important; }
        .ops-nav-btn:hover { color:${T.gold} !important; background:${T.goldDim} !important; }
        .ops-fcard         { transition:transform .18s, border-color .18s, box-shadow .18s; cursor:pointer; }
        .ops-fcard:hover   { transform:translateY(-3px); box-shadow:0 6px 24px rgba(0,0,0,.5); }
        .ops-upd           { transition:all .15s !important; }
        .ops-upd:hover     { background:rgba(240,160,48,.22) !important; border-color:${T.amber} !important; transform:scale(1.05); }
        .ops-del           { transition:all .15s !important; }
        .ops-del:hover     { background:rgba(224,82,82,.22) !important; border-color:${T.red} !important; color:${T.red} !important; }
        .ops-pending       { animation:opsPulse 2.4s ease-in-out infinite; }
        button:focus-visible { outline:2px solid ${T.gold}; outline-offset:2px; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-thumb { background:${T.subtle}; border-radius:99px; }
      `}</style>

      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
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
            <p style={{ margin: "2px 0 0", fontSize: 8, color: T.muted, letterSpacing: "0.2em" }}>MANAGER PANEL</p>
          </div>
        </div>

        {/* Team chip */}
        {teamInfo && (
          <div style={{
            margin: "12px 12px 0",
            padding: "8px 12px", borderRadius: 3,
            background: T.goldDim, border: `1px solid ${T.goldBorder}`,
          }}>
            <p style={{ margin: 0, fontSize: 8, color: T.muted, letterSpacing: "0.16em", fontFamily: "'Cinzel', serif" }}>TEAM</p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: T.gold, fontFamily: "'Cinzel', serif", fontWeight: 600 }}>
              {teamInfo.teamName || "My Team"}
            </p>
            <p style={{ margin: "1px 0 0", fontSize: 9, color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>
              {ppcMembers.length} PPC member{ppcMembers.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}

        {/* Navigation */}
        <div style={{ padding: "18px 10px 10px", flex: 1 }}>
          <p style={{ margin: "0 0 10px 10px", fontSize: 8, color: T.muted, letterSpacing: "0.2em", fontFamily: "'Cinzel', serif" }}>NAVIGATION ·</p>
          {[
            { id: "campaigns", label: "Team Campaigns", count: campaigns.length },
            { id: "create",    label: "Create Campaign", count: null },
            { id: "team",      label: "Team Members",    count: ppcMembers.length },
          ].map(item => {
            const active = activeSection === item.id;
            return (
              <button key={item.id} className="ops-nav-btn" onClick={() => goTo(item.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  width: "100%", padding: "10px 12px 10px 10px",
                  borderRadius: 3, background: active ? T.goldDim : "transparent",
                  border: "none", color: active ? T.gold : T.muted,
                  fontSize: 13, fontWeight: active ? 500 : 400,
                  cursor: "pointer", marginBottom: 2,
                  fontFamily: "'DM Sans', sans-serif", textAlign: "left",
                  transition: "all .15s",
                }}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                  background: active ? T.gold : T.subtle,
                }} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.count !== null && item.count > 0 && (
                  <span style={{
                    padding: "1px 7px", borderRadius: 99,
                    background: active ? T.gold : T.subtle,
                    color: active ? "#0c0b08" : T.muted,
                    fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 700,
                  }}>{item.count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Account */}
        <div style={{ padding: "14px 16px 20px", borderTop: `1px solid ${T.goldBorder}` }}>
          <p style={{ margin: "0 0 10px", fontSize: 8, letterSpacing: "0.2em", color: T.muted, fontFamily: "'Cinzel', serif" }}>— ACCOUNT</p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: T.goldDim, border: `1px solid ${T.goldBorder}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, color: T.gold, fontFamily: "'Cinzel', serif",
            }}>{initials(user || "M")}</div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: T.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 128 }}>{user || "Manager"}</p>
              <p style={{ margin: 0, fontSize: 8, color: T.muted, letterSpacing: "0.12em" }}>MANAGER · ACTIVE</p>
            </div>
          </div>
          <button onClick={handleLogout}
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
            {isMobile && (
              <button onClick={() => setSidebarOpen(v => !v)}
                style={{
                  background: "transparent", border: `1px solid ${T.subtle}`,
                  color: T.gold, cursor: "pointer", padding: "6px 9px",
                  borderRadius: 3, fontSize: 16, lineHeight: 1, transition: "all .15s",
                }}
              >{sidebarOpen ? "✕" : "☰"}</button>
            )}
            <div>
              <p style={{ margin: 0, fontSize: 8, letterSpacing: "0.24em", color: T.gold, fontFamily: "'Cinzel', serif" }}>— MANAGER PANEL</p>
              <h1 style={{ margin: "2px 0 0", fontSize: isMobile ? 17 : 22, fontWeight: 600, color: T.white, fontFamily: "'Cinzel', serif", letterSpacing: "0.02em", lineHeight: 1.1 }}>
                {{ campaigns: "Team Campaigns", create: "Create Campaign", team: "Team Members" }[activeSection] || "Dashboard"}
              </h1>
            </div>
          </div>

          {/* Notification bell */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowNotifs(v => !v)}
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

        {/* Page-level error */}
        {pageError && (
          <div style={{
            margin: "16px 28px 0", padding: "10px 14px",
            background: T.redBg, border: `1px solid ${T.red}44`,
            borderRadius: 3, color: T.red, fontSize: 12,
          }}>{pageError}</div>
        )}

        {/* ══════════════════════════════════════════════════════════
            SECTION: CAMPAIGNS
        ══════════════════════════════════════════════════════════ */}
        {activeSection === "campaigns" && (
          <div style={{ padding: isMobile ? "16px 14px" : "22px 28px", flex: 1 }}>

            {/* ── Single row of filter cards (no duplicate) ─────────── */}
            <div style={{
              display: "flex", gap: 10,
              overflowX: isMobile ? "auto" : "unset",
              flexWrap: isMobile ? "nowrap" : "wrap",
              marginBottom: 22,
              paddingBottom: isMobile ? 4 : 0,
            }}>
              {FILTER_CARDS.map(card => {
                const active = statusFilter === card.id;
                const count  = stats[card.id] ?? 0;
                return (
                  <div key={card.id} className="ops-fcard"
                    onClick={() => setStatusFilter(prev => prev === card.id ? null : card.id)}
                    style={{
                      flex: isMobile ? "0 0 120px" : "1 1 0",
                      minWidth: isMobile ? 120 : 100,
                      padding: "14px 16px 12px", borderRadius: 4,
                      background: active ? card.bg : T.bgCard,
                      border: `1px solid ${active ? card.color : T.goldBorder}`,
                      userSelect: "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: card.color, flexShrink: 0 }} />
                      <span style={{
                        fontSize: 8, fontWeight: 700, letterSpacing: "0.18em",
                        color: active ? card.color : T.muted, fontFamily: "'Cinzel', serif",
                      }}>{card.label.toUpperCase()}</span>
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: active ? card.color : T.white, fontFamily: "'Cinzel', serif", lineHeight: 1 }}>
                      {count}
                    </div>
                    <div style={{ fontSize: 9, color: T.muted, marginTop: 4 }}>campaigns</div>
                  </div>
                );
              })}
            </div>

            {/* ── Campaigns table card ────────────────────────────────── */}
            <div style={{
              background: T.bgCard, border: `1px solid ${T.goldBorder}`,
              borderRadius: 4, overflow: "hidden",
              animation: "opsFadeUp .28s .05s ease both",
            }}>
              {/* Toolbar */}
              <div style={{
                padding: "12px 18px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 10, flexWrap: "wrap",
                borderBottom: `1px solid ${T.subtle}`,
                background: `${T.bg}cc`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.2em", color: T.gold, fontFamily: "'Cinzel', serif" }}>
                    TEAM CAMPAIGNS
                  </span>
                  <span style={{
                    padding: "2px 9px", borderRadius: 2,
                    background: T.goldDim, border: `1px solid ${T.goldBorder}`,
                    fontSize: 9, color: T.gold, fontFamily: "'JetBrains Mono', monospace",
                  }}>{filtered.length} records</span>
                  {statusFilter && (
                    <button onClick={() => setStatusFilter(null)}
                      style={{
                        background: "transparent", border: `1px solid ${T.subtle}`,
                        color: T.muted, fontSize: 9, cursor: "pointer",
                        padding: "2px 8px", borderRadius: 2, transition: "all .15s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = T.red; e.currentTarget.style.borderColor = T.red; }}
                      onMouseLeave={e => { e.currentTarget.style.color = T.muted; e.currentTarget.style.borderColor = T.subtle; }}
                    >✕ Clear filter</button>
                  )}
                </div>
                <div style={{ position: "relative", flexShrink: 0, width: isMobile ? "100%" : "auto" }}>
                  <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.muted, fontSize: 13, pointerEvents: "none" }}>⌕</span>
                  <input className="ops-focus" type="text" placeholder="Search campaigns…"
                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    style={{ ...inputSx, paddingLeft: 32, height: 34, width: isMobile ? "100%" : 210, fontSize: 12, borderRadius: 3 }}
                  />
                </div>
              </div>

              {/* Table */}
              {loading ? (
                <div style={{ padding: "52px 20px", textAlign: "center", color: T.muted, fontSize: 13 }}>
                  <div style={{ marginBottom: 10, color: T.gold, fontSize: 22 }}>◈</div>Loading campaigns…
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: "52px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 24, color: T.subtle, marginBottom: 12, fontFamily: "'Cinzel', serif" }}>◇</div>
                  <p style={{ margin: 0, fontSize: 14, color: T.white, fontFamily: "'Cinzel', serif" }}>No Records Found</p>
                  <p style={{ margin: "8px 0 20px", fontSize: 13, color: T.muted }}>
                    {searchQuery || statusFilter ? "Adjust your search or filter." : "No team campaigns yet."}
                  </p>
                  {!searchQuery && !statusFilter && (
                    <GoldBtn variant="outline" onClick={() => goTo("create")}>CREATE CAMPAIGN</GoldBtn>
                  )}
                </div>
              ) : (
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${T.subtle}`, background: `${T.bg}dd` }}>
                        {["SUBMITTED BY", "TIMESTAMP", "MESSAGE", "PM COMMENT", "STATUS", "PM ACTION", "REQUESTED", "IT COMMENT", "TICKET"].map(h => (
                          <th key={h} style={{
                            padding: "10px 14px", textAlign: "left",
                            fontSize: 9, fontWeight: 600, color: T.gold,
                            letterSpacing: "0.14em", fontFamily: "'Cinzel', serif",
                            whiteSpace: "nowrap",
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c, i) => {
                        const creatorId = typeof c.createdBy === "object" ? c.createdBy?._id : c.createdBy;
                        const member    = teamInfo?.members?.find(m => m._id === creatorId);
                        const isOwn     = !member; // if not in team members, it's the manager's own
                        const canEdit   = c.status === "transfer";

                        return (
                          <tr key={c._id} className="ops-row"
                            style={{
                              borderBottom: `1px solid ${T.subtle}22`,
                              background: i % 2 === 1 ? `${T.bgCard}88` : "transparent",
                            }}
                          >
                            {/* SUBMITTED BY */}
                            <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                <div style={{
                                  width: 22, height: 22, borderRadius: "50%",
                                  background: isOwn ? T.goldDim : T.purpleBg,
                                  border: `1px solid ${isOwn ? T.gold : T.purple}44`,
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  fontSize: 9, fontWeight: 700,
                                  color: isOwn ? T.gold : T.purple,
                                  fontFamily: "'Cinzel', serif", flexShrink: 0,
                                }}>
                                  {initials(member?.username || user || "M")}
                                </div>
                                <span style={{ fontSize: 11, color: isOwn ? T.gold : T.text, fontFamily: "'DM Sans', sans-serif" }}>
                                  {member?.username || user || "—"}
                                </span>
                              </div>
                            </td>

                            {/* TIMESTAMP */}
                            <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                              <span style={{ fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>{fmt(c.createdAt)}</span>
                            </td>

                            {/* MESSAGE */}
                            <td style={{ padding: "12px 14px", minWidth: 160, maxWidth: 240 }}>
                              <p style={{ margin: 0, fontSize: 12, color: T.text, lineHeight: 1.55, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{c.message}</p>
                            </td>

                            {/* PM COMMENT */}
                            <td style={{ padding: "12px 14px", minWidth: 130, maxWidth: 200 }}>
                              {c.pmMessage
                                ? <p style={{ margin: 0, fontSize: 12, color: T.muted, lineHeight: 1.55, fontStyle: "italic", wordBreak: "break-word" }}>{c.pmMessage}</p>
                                : <span style={{ fontSize: 11, color: T.subtle, fontFamily: "'JetBrains Mono', monospace" }}>—</span>
                              }
                            </td>

                            {/* STATUS */}
                            <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                              <StatusBadge value={c.status} meta={STATUS_META} />
                            </td>

                            {/* PM ACTION */}
                            <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                              {c.action
                                ? <StatusBadge value={c.action} meta={ACTION_META} />
                                : <span className="ops-pending" style={{
                                    display: "inline-flex", alignItems: "center",
                                    padding: "3px 9px", borderRadius: 2,
                                    background: "rgba(122,112,96,0.11)", color: T.muted,
                                    fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
                                    fontFamily: "'Cinzel', serif",
                                    border: `1px solid ${T.muted}33`,
                                  }}>PENDING</span>
                              }
                            </td>

                            {/* REQUESTED AT */}
                            <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                              <span style={{ fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>{fmt(c.requestedAt)}</span>
                            </td>

                            {/* IT COMMENT */}
                            <td style={{ padding: "12px 14px", minWidth: 120, maxWidth: 180 }}>
                              {c.itMessage
                                ? <span style={{ fontSize: 11, color: T.teal, fontStyle: "italic", wordBreak: "break-word", display: "block" }}>{c.itMessage}</span>
                                : <span style={{ fontSize: 11, color: T.subtle, fontFamily: "'JetBrains Mono', monospace" }}>—</span>
                              }
                            </td>

                            {/* TICKET STATE */}
                            <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                              {canEdit ? (
                                <button className="ops-upd" onClick={() => setUpdateTarget(c)}
                                  style={{
                                    padding: "4px 12px", borderRadius: 2,
                                    background: T.amberBg, border: `1px solid ${T.amber}44`,
                                    color: T.amber, fontSize: 9, fontWeight: 700,
                                    letterSpacing: "0.12em", cursor: "pointer",
                                    fontFamily: "'Cinzel', serif",
                                  }}
                                >UPDATE</button>
                              ) : (
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
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Footer */}
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

        {/* ══════════════════════════════════════════════════════════
            SECTION: CREATE CAMPAIGN
        ══════════════════════════════════════════════════════════ */}
        {activeSection === "create" && (
          <div style={{ padding: isMobile ? "16px 14px" : "22px 28px", flex: 1 }}>
            <div style={{ maxWidth: 560 }}>

              {/* Team ID indicator */}
              <div style={{
                padding: "11px 16px", marginBottom: 20,
                border: `1px solid ${teamId ? T.goldBorder : T.red + "44"}`,
                borderRadius: 4, background: T.bgCard,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{
                  width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                  background: teamId ? T.green : T.red,
                  boxShadow: teamId ? `0 0 6px ${T.green}` : "none",
                }} />
                <div>
                  <p style={{ margin: 0, fontSize: 9, color: T.muted, letterSpacing: "0.14em", fontFamily: "'Cinzel', serif" }}>
                    {teamId ? "TEAM RESOLVED" : "TEAM NOT FOUND"}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: teamId ? T.gold : T.red, fontFamily: "'JetBrains Mono', monospace" }}>
                    {teamId ? teamId.slice(0, 24) + "…" : "Please wait or refresh the page"}
                  </p>
                </div>
              </div>

              {/* Form card */}
              <div style={{
                background: T.bgCard, border: `1px solid ${T.goldBorder}`,
                borderRadius: 4, padding: isMobile ? "22px 18px" : "28px 26px 24px",
                animation: "opsFadeUp .28s .05s ease both",
              }}>
                <p style={{ margin: 0, fontSize: 8, letterSpacing: "0.22em", color: T.gold, fontFamily: "'Cinzel', serif" }}>— NEW REQUEST</p>
                <h2 style={{ margin: "4px 0 22px", fontSize: 15, fontWeight: 600, color: T.white, fontFamily: "'Cinzel', serif", letterSpacing: "0.08em" }}>
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
                  <Field label="MESSAGE" hint="required">
                    <textarea className="ops-focus"
                      value={createForm.message}
                      onChange={e => setCreateForm(f => ({ ...f, message: e.target.value }))}
                      placeholder="Describe the campaign request in detail…"
                      rows={4} required
                      style={{ ...inputSx, resize: "vertical", lineHeight: 1.6 }}
                    />
                  </Field>
                  <Field label="REQUESTED DATE / TIME" hint="optional — defaults to now">
                    <input type="datetime-local" className="ops-focus"
                      value={createForm.requestedAt}
                      onChange={e => setCreateForm(f => ({ ...f, requestedAt: e.target.value }))}
                      style={{ ...inputSx, colorScheme: "dark" }}
                    />
                  </Field>
                  <div style={{ borderTop: `1px solid ${T.subtle}`, paddingTop: 20, marginTop: 6 }}>
                    <GoldBtn type="submit" disabled={creating || !teamId} style={{ width: "100%", padding: "13px" }}>
                      {creating ? "CREATING…" : !teamId ? "LOADING TEAM…" : "CREATE CAMPAIGN"}
                    </GoldBtn>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            SECTION: TEAM MEMBERS
        ══════════════════════════════════════════════════════════ */}
        {activeSection === "team" && (
          <div style={{ padding: isMobile ? "16px 14px" : "22px 28px", flex: 1 }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 24, alignItems: "start" }}>

              {/* ── Left: Create PPC user form ──────────────────────── */}
              <div style={{
                background: T.bgCard, border: `1px solid ${T.goldBorder}`,
                borderRadius: 4, padding: "24px 22px",
                animation: "opsFadeUp .22s ease",
              }}>
                <p style={{ margin: "0 0 4px", fontSize: 8, letterSpacing: "0.22em", color: T.gold, fontFamily: "'Cinzel', serif" }}>— ADD MEMBER</p>
                <h2 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 600, color: T.white, fontFamily: "'Cinzel', serif" }}>Add PPC Member</h2>

                {userError && (
                  <div style={{ padding: "10px 14px", borderRadius: 3, marginBottom: 16, background: T.redBg, border: `1px solid ${T.red}44`, color: T.red, fontSize: 12 }}>
                    {userError}
                  </div>
                )}
                {userOk && (
                  <div style={{ padding: "10px 14px", borderRadius: 3, marginBottom: 16, background: T.greenBg, border: `1px solid ${T.green}44`, color: T.green, fontSize: 11, fontFamily: "'Cinzel', serif", letterSpacing: "0.08em" }}>
                    ✓ PPC MEMBER ADDED
                  </div>
                )}

                <form onSubmit={handleCreateUser}>
                  <Field label="USERNAME" hint="required">
                    <input className="ops-focus" type="text"
                      value={userForm.username}
                      onChange={e => setUserForm(f => ({ ...f, username: e.target.value }))}
                      placeholder="e.g. john_doe" required style={inputSx}
                    />
                  </Field>
                  <Field label="EMAIL" hint="@satkartar.com or @skinrange.com">
                    <input className="ops-focus" type="email"
                      value={userForm.email}
                      onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="user@satkartar.com" required style={inputSx}
                    />
                  </Field>
                  <Field label="PASSWORD" hint="required">
                    <input className="ops-focus" type="password"
                      value={userForm.password}
                      onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="••••••••••" required style={inputSx}
                    />
                  </Field>
                  <div style={{ borderTop: `1px solid ${T.subtle}`, paddingTop: 18, marginTop: 2 }}>
                    <GoldBtn type="submit" disabled={creatingUser} style={{ width: "100%", padding: "12px" }}>
                      {creatingUser ? "ADDING…" : "ADD PPC MEMBER"}
                    </GoldBtn>
                  </div>
                </form>
              </div>

              {/* ── Right: PPC member cards ──────────────────────────── */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <p style={{ margin: 0, fontSize: 8, color: T.muted, letterSpacing: "0.2em", fontFamily: "'Cinzel', serif" }}>TEAM MEMBERS ·</p>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{
                      padding: "2px 9px", borderRadius: 2,
                      background: T.goldDim, border: `1px solid ${T.goldBorder}`,
                      fontSize: 9, color: T.gold, fontFamily: "'JetBrains Mono', monospace",
                    }}>{ppcMembers.length} members</span>
                    <GoldBtn variant="outline" onClick={loadTeamInfo} style={{ padding: "5px 12px", fontSize: 9 }}>REFRESH</GoldBtn>
                  </div>
                </div>

                {teamLoading ? (
                  <div style={{ padding: "40px 20px", textAlign: "center", color: T.muted }}>
                    <div style={{ marginBottom: 10, color: T.gold, fontSize: 22 }}>◈</div>Loading members…
                  </div>
                ) : ppcMembers.length === 0 ? (
                  <div style={{
                    padding: "40px 20px", textAlign: "center",
                    background: T.bgCard, border: `1px solid ${T.goldBorder}`, borderRadius: 4,
                  }}>
                    <div style={{ fontSize: 24, color: T.subtle, marginBottom: 12, fontFamily: "'Cinzel', serif" }}>◇</div>
                    <p style={{ margin: 0, fontSize: 14, color: T.white, fontFamily: "'Cinzel', serif" }}>No PPC Members Yet</p>
                    <p style={{ margin: "6px 0 0", fontSize: 13, color: T.muted }}>Add your first PPC member using the form.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {ppcMembers.map(u => {
                      const memberCampaignCount = campaigns.filter(c => {
                        const id = typeof c.createdBy === "object" ? c.createdBy?._id : c.createdBy;
                        return String(id) === String(u._id);
                      }).length;

                      return (
                        <div key={u._id}
                          style={{
                            background: T.bgCard, border: `1px solid ${T.goldBorder}`,
                            borderRadius: 4, padding: "16px 18px",
                            transition: "border-color .2s, box-shadow .2s",
                            animation: "opsFadeUp .22s ease",
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = T.gold + "44"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,.4)"; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = T.goldBorder; e.currentTarget.style.boxShadow = "none"; }}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{
                                width: 36, height: 36, borderRadius: "50%",
                                background: T.purpleBg, border: `1px solid ${T.purple}44`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 12, fontWeight: 700, color: T.purple, fontFamily: "'Cinzel', serif",
                                flexShrink: 0,
                              }}>{initials(u.username || "U")}</div>
                              <div>
                                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: T.white, fontFamily: "'Cinzel', serif" }}>{u.username || "—"}</p>
                                <p style={{ margin: "2px 0 0", fontSize: 10, color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>{u.email || "—"}</p>
                              </div>
                            </div>
                            <button className="ops-del" onClick={() => setDeleteTarget(u)}
                              style={{
                                padding: "4px 10px", borderRadius: 2,
                                background: T.redBg, border: `1px solid ${T.red}33`,
                                color: T.muted, fontSize: 9, fontWeight: 700,
                                letterSpacing: "0.1em", cursor: "pointer",
                                fontFamily: "'Cinzel', serif",
                              }}
                            >REMOVE</button>
                          </div>

                          <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
                            <div>
                              <p style={{ margin: "0 0 2px", fontSize: 8, color: T.muted, letterSpacing: "0.12em", fontFamily: "'Cinzel', serif" }}>ROLE</p>
                              <span style={{
                                padding: "2px 8px", borderRadius: 2,
                                background: T.blueBg, color: T.blue,
                                fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                                fontFamily: "'Cinzel', serif", border: `1px solid ${T.blue}33`,
                              }}>PPC</span>
                            </div>
                            <div>
                              <p style={{ margin: "0 0 2px", fontSize: 8, color: T.muted, letterSpacing: "0.12em", fontFamily: "'Cinzel', serif" }}>CAMPAIGNS</p>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: memberCampaignCount > 0 ? T.gold : T.subtle, fontFamily: "'Cinzel', serif" }}>
                                {memberCampaignCount}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {updateTarget && (
        <UpdateModal
          campaign={updateTarget}
          onClose={() => setUpdateTarget(null)}
          onSave={handleUpdate}
        />
      )}
      {deleteTarget && (
        <DeleteUserModal
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteUser}
        />
      )}
    </div>
  );
}