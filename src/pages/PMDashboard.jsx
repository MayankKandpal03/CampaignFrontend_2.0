/**
 * PMDashboard.jsx — OPS SUITE Process Manager Dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 * Sections:
 *   • Campaigns      — all campaigns, approve / cancel modal (pmMessage + scheduleAt)
 *   • PPC Users      — cards with user info, delete
 *   • Manage Users   — create user form (POST /user/create)
 *   • Open Requests  — approved by PM, not yet acknowledged by IT
 *   • Closed Requests— cancelled OR IT-acknowledged
 *
 * API surface consumed:
 *   GET  /api/v1/campaign/get          — all campaigns (PM sees all)
 *   POST /api/v1/campaign/update       — { campaignId, action, pmMessage, scheduleAt }
 *   GET  /api/v1/user/list             — (best-effort; falls back to campaign data)
 *   POST /api/v1/user/create           — { username, email, password, role }
 *   POST /api/v1/user/delete           — { id }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
  transfer:   { label: "IN REVIEW",  color: T.blue,   bg: T.blueBg  },
  cancel:     { label: "CANCELLED",  color: T.red,    bg: T.redBg   },
  done:       { label: "DONE",       color: T.green,  bg: T.greenBg },
  "not done": { label: "NOT DONE",   color: T.amber,  bg: T.amberBg },
};
const ACTION_META = {
  approve: { label: "APPROVED",  color: T.teal,   bg: T.tealBg  },
  cancel:  { label: "REJECTED",  color: T.red,    bg: T.redBg   },
  done:    { label: "COMPLETED", color: T.green,  bg: T.greenBg },
};
const ACK_META = {
  done:     { label: "ACK DONE",     color: T.green, bg: T.greenBg },
  "not done":{ label: "ACK NOT DONE",color: T.amber, bg: T.amberBg },
};

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
  n.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("") || "PM";

const toLocalISO = (d) => {
  if (!d) return "";
  try {
    const dt = new Date(d);
    dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
    return dt.toISOString().slice(0, 16);
  } catch { return ""; }
};

const ROLE_COLOR = {
  ppc:              { color: T.blue,   bg: T.blueBg   },
  manager:          { color: T.gold,   bg: T.goldDim  },
  "process manager":{ color: T.purple, bg: T.purpleBg },
  it:               { color: T.teal,   bg: T.tealBg   },
};

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
    }}>{m.label}</span>
  );
}

/* ─── RoleBadge ──────────────────────────────────────────────────────────── */
function RoleBadge({ role }) {
  const m = ROLE_COLOR[role] ?? { color: T.muted, bg: "rgba(122,112,96,0.11)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 8px", borderRadius: 2,
      background: m.bg, color: m.color,
      fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
      fontFamily: "'Cinzel', serif", whiteSpace: "nowrap",
      border: `1px solid ${m.color}33`,
    }}>{(role || "—").toUpperCase()}</span>
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

/* ─── inputSx ────────────────────────────────────────────────────────────── */
const inputSx = {
  width: "100%", boxSizing: "border-box",
  background: T.bgInput, border: `1px solid ${T.subtle}`,
  borderRadius: 3, color: T.text,
  fontSize: 13, padding: "11px 14px", outline: "none",
  fontFamily: "'DM Sans', sans-serif", transition: "border-color 0.2s, box-shadow 0.2s",
};

/* ─── Field ──────────────────────────────────────────────────────────────── */
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

/* ─── SectionDivider ─────────────────────────────────────────────────────── */
function SectionLabel({ children }) {
  return (
    <p style={{ margin: "0 0 10px 10px", fontSize: 8, color: T.muted, letterSpacing: "0.2em", fontFamily: "'Cinzel', serif" }}>
      {children} ·
    </p>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ACTION MODAL  (PM approves or cancels a campaign)
═══════════════════════════════════════════════════════════════════════════ */
function ActionModal({ campaign, onClose, onSave }) {
  const [action,     setAction]     = useState("approve");
  const [pmMessage,  setPmMessage]  = useState("");
  const [scheduleAt, setScheduleAt] = useState(toLocalISO(new Date()));
  const [busy,       setBusy]       = useState(false);
  const [err,        setErr]        = useState("");

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  if (!campaign) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await onSave(campaign._id, {
        action,
        pmMessage: pmMessage.trim() || undefined,
        scheduleAt: action === "approve" ? (scheduleAt || new Date().toISOString()) : undefined,
      });
      onClose();
    } catch (ex) {
      setErr(ex?.response?.data?.message || "Action failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.82)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div style={{
        background: T.bgCard, border: `1px solid ${T.goldBorder}`,
        borderRadius: 4, padding: "28px 26px 24px",
        width: "100%", maxWidth: 500,
        animation: "opsIn 0.22s cubic-bezier(.22,1,.36,1)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <p style={{ margin: 0, fontSize: 8, letterSpacing: "0.22em", color: T.gold, fontFamily: "'Cinzel', serif" }}>— PM ACTION</p>
            <h3 style={{ margin: "4px 0 0", fontSize: 17, fontWeight: 600, color: T.white, fontFamily: "'Cinzel', serif" }}>
              Campaign Review
            </h3>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: `1px solid ${T.subtle}`,
            color: T.muted, cursor: "pointer",
            width: 28, height: 28, borderRadius: 2, fontSize: 13,
            display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.color = T.red; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.subtle; e.currentTarget.style.color = T.muted; }}
          >✕</button>
        </div>

        {/* Campaign preview */}
        <div style={{
          padding: "10px 14px", background: T.bgInput,
          border: `1px solid ${T.subtle}`, borderRadius: 3, marginBottom: 20,
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px",
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 9, letterSpacing: "0.12em", color: T.muted, fontFamily: "'Cinzel', serif", marginBottom: 4 }}>MESSAGE</p>
            <p style={{ margin: 0, fontSize: 12, color: T.text, lineHeight: 1.5, wordBreak: "break-word" }}>{campaign.message}</p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 9, letterSpacing: "0.12em", color: T.muted, fontFamily: "'Cinzel', serif", marginBottom: 4 }}>SUBMITTED</p>
            <p style={{ margin: 0, fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>{fmt(campaign.createdAt)}</p>
          </div>
        </div>

        {err && (
          <div style={{
            padding: "9px 13px", background: T.redBg,
            border: `1px solid ${T.red}44`, borderRadius: 3, color: T.red,
            fontSize: 12, marginBottom: 16,
          }}>{err}</div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Action selector */}
          <Field label="ACTION">
            <div style={{ display: "flex", gap: 10 }}>
              {[
                { val: "approve", label: "APPROVE", desc: "Forward to IT queue", color: T.teal, bg: T.tealBg },
                { val: "cancel",  label: "CANCEL",  desc: "Reject this campaign", color: T.red,  bg: T.redBg  },
              ].map(({ val, label, desc, color, bg }) => {
                const active = action === val;
                return (
                  <button key={val} type="button" onClick={() => setAction(val)}
                    style={{
                      flex: 1, padding: "12px 10px", borderRadius: 3, cursor: "pointer",
                      background: active ? bg : T.bgInput,
                      border: `1px solid ${active ? color : T.subtle}`,
                      color: active ? color : T.muted,
                      transition: "all 0.15s",
                      transform: active ? "scale(1.02)" : "scale(1)",
                    }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = color + "66"; e.currentTarget.style.color = color; } }}
                    onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = T.subtle; e.currentTarget.style.color = T.muted; } }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", fontFamily: "'Cinzel', serif", marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 10, opacity: 0.7, fontFamily: "'DM Sans', sans-serif" }}>{desc}</div>
                  </button>
                );
              })}
            </div>
          </Field>

          {/* PM Message */}
          <Field label="PM MESSAGE" hint="optional — leave blank if not needed">
            <textarea
              className="ops-focus"
              value={pmMessage}
              onChange={e => setPmMessage(e.target.value)}
              placeholder={action === "approve" ? "Add a note for IT (optional)…" : "Reason for cancellation (optional)…"}
              rows={3}
              style={{ ...inputSx, resize: "vertical", lineHeight: 1.6 }}
            />
          </Field>

          {/* Schedule — only for approve */}
          {action === "approve" && (
            <Field label="SCHEDULE AT" hint="defaults to now if not set">
              <input
                type="datetime-local"
                className="ops-focus"
                value={scheduleAt}
                onChange={e => setScheduleAt(e.target.value)}
                style={{ ...inputSx, colorScheme: "dark" }}
              />
            </Field>
          )}

          {/* Cancel warning */}
          {action === "cancel" && (
            <div style={{
              padding: "11px 14px", background: T.redBg,
              border: `1px solid ${T.red}33`, borderRadius: 3, marginBottom: 18,
            }}>
              <p style={{ margin: 0, fontSize: 12, color: "#f09090", lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif" }}>
                ⚠ This will permanently <strong style={{ color: T.red }}>CANCEL</strong> the campaign. The PPC user will be notified and no further edits will be possible.
              </p>
            </div>
          )}

          {/* Buttons */}
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
                background: action === "cancel" ? T.redBg : T.gold,
                border: `1px solid ${action === "cancel" ? T.red + "66" : T.gold}`,
                color: action === "cancel" ? T.red : "#0c0b08",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
                fontFamily: "'Cinzel', serif", transition: "all 0.15s",
              }}
              onMouseEnter={e => {
                if (!busy) e.currentTarget.style.background = action === "cancel" ? "rgba(224,82,82,0.22)" : T.goldLight;
              }}
              onMouseLeave={e => { e.currentTarget.style.background = action === "cancel" ? T.redBg : T.gold; }}
            >{busy ? "SAVING…" : action === "cancel" ? "CONFIRM CANCEL" : "CONFIRM APPROVE"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DELETE USER CONFIRM MODAL
═══════════════════════════════════════════════════════════════════════════ */
function DeleteUserModal({ user: targetUser, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  if (!targetUser) return null;

  const handle = async () => {
    setBusy(true);
    setErr("");
    try {
      await onConfirm(targetUser._id);
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
          <h3 style={{ margin: "4px 0 0", fontSize: 17, fontWeight: 600, color: T.white, fontFamily: "'Cinzel', serif" }}>Delete User</h3>
        </div>

        <div style={{
          padding: "12px 14px", background: T.bgInput,
          border: `1px solid ${T.subtle}`, borderRadius: 3, marginBottom: 18,
        }}>
          <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 500, color: T.text, fontFamily: "'Cinzel', serif" }}>{targetUser.username}</p>
          <p style={{ margin: 0, fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>{targetUser.email}</p>
          <RoleBadge role={targetUser.role} />
        </div>

        <div style={{
          padding: "10px 14px", background: T.redBg,
          border: `1px solid ${T.red}33`, borderRadius: 3, marginBottom: 18,
        }}>
          <p style={{ margin: 0, fontSize: 12, color: "#f09090", lineHeight: 1.6 }}>
            ⚠ This action is <strong style={{ color: T.red }}>permanent</strong>. The user will be removed from all teams and cannot log in.
          </p>
        </div>

        {err && <div style={{ padding: "9px 13px", background: T.redBg, borderRadius: 3, color: T.red, fontSize: 12, marginBottom: 14 }}>{err}</div>}

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
          >{busy ? "DELETING…" : "CONFIRM DELETE"}</button>
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
      position: "absolute", top: 46, right: 0, width: 310, zIndex: 600,
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
      <div style={{ maxHeight: 320, overflowY: "auto" }}>
        {notifications.length === 0 ? (
          <p style={{ padding: "20px 16px", textAlign: "center", color: T.muted, fontSize: 12, margin: 0 }}>No notifications</p>
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

/* ─── CampaignsTable ─────────────────────────────────────────────────────── */
function CampaignsTable({ campaigns, loading, onAction, isMobile, title = "ALL CAMPAIGNS", showActionBtn = true }) {
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatusFilter] = useState(null);

  const FILTER_CARDS = [
    { id: "transfer",  label: "In Review",  color: T.blue,  bg: T.blueBg  },
    { id: "approve",   label: "Approved",   color: T.teal,  bg: T.tealBg  },
    { id: "done",      label: "Done",       color: T.green, bg: T.greenBg },
    { id: "cancel",    label: "Cancelled",  color: T.red,   bg: T.redBg   },
  ];

  const stats = useMemo(() => ({
    transfer: campaigns.filter(c => c.status  === "transfer").length,
    approve:  campaigns.filter(c => c.action  === "approve").length,
    done:     campaigns.filter(c => c.status  === "done").length,
    cancel:   campaigns.filter(c => c.status  === "cancel" || c.action === "cancel").length,
  }), [campaigns]);

  const filtered = useMemo(() => {
    let list = [...campaigns];
    if (statusFilter) {
      list = statusFilter === "approve"
        ? list.filter(c => c.action === "approve")
        : statusFilter === "cancel"
        ? list.filter(c => c.status === "cancel" || c.action === "cancel")
        : list.filter(c => c.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.message?.toLowerCase().includes(q) ||
        fmt(c.createdAt).includes(q) ||
        fmt(c.requestedAt).includes(q)
      );
    }
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [campaigns, statusFilter, search]);

  return (
    <div>
      {/* Filter cards */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        {FILTER_CARDS.map(card => {
          const active = statusFilter === card.id;
          return (
            <div key={card.id} className="ops-fcard"
              onClick={() => setStatusFilter(prev => prev === card.id ? null : card.id)}
              style={{
                flex: isMobile ? "0 0 130px" : "1 1 0", minWidth: 110,
                padding: "14px 16px 12px", borderRadius: 4,
                background: active ? card.bg : T.bgCard,
                border: `1px solid ${active ? card.color : T.goldBorder}`,
                cursor: "pointer", userSelect: "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: card.color, flexShrink: 0 }} />
                <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.18em", color: active ? card.color : T.muted, fontFamily: "'Cinzel', serif" }}>
                  {card.label.toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: active ? card.color : T.white, fontFamily: "'Cinzel', serif", lineHeight: 1 }}>
                {stats[card.id] ?? 0}
              </div>
              <div style={{ fontSize: 9, color: T.muted, marginTop: 4 }}>campaigns</div>
            </div>
          );
        })}
      </div>

      {/* Table card */}
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
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.2em", color: T.gold, fontFamily: "'Cinzel', serif" }}>{title}</span>
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
            <input className="ops-focus" type="text" placeholder="Search message, date, time…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ ...inputSx, paddingLeft: 32, height: 34, width: isMobile ? "100%" : 240, fontSize: 12, borderRadius: 3 }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "52px 20px", textAlign: "center", color: T.muted, fontSize: 13 }}>
            <div style={{ marginBottom: 10, color: T.gold, fontSize: 22 }}>◈</div>Loading campaigns…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "52px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 24, color: T.subtle, marginBottom: 12, fontFamily: "'Cinzel', serif" }}>◇</div>
            <p style={{ margin: 0, fontSize: 14, color: T.white, fontFamily: "'Cinzel', serif", letterSpacing: "0.04em" }}>No Records Found</p>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: T.muted }}>Try adjusting your search or filter.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.subtle}`, background: `${T.bg}dd` }}>
                  {["TIMESTAMP", "PPC MESSAGE", "PM COMMENT", "STATUS", "PM ACTION", "REQUESTED TIME", "SCHEDULE AT", "IT COMMENT", "TICKET STATE"].map(h => (
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
                  const isClosed = c.status === "cancel" || c.action === "cancel" || c.status === "done" || c.acknowledgement;
                  const canAct   = !isClosed && showActionBtn;
                  return (
                    <tr key={c._id} className="ops-row"
                      style={{
                        borderBottom: `1px solid ${T.subtle}22`,
                        background: i % 2 === 1 ? `${T.bgCard}88` : "transparent",
                      }}
                    >
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>{fmt(c.createdAt)}</span>
                      </td>
                      <td style={{ padding: "12px 14px", minWidth: 160, maxWidth: 240 }}>
                        <p style={{ margin: 0, fontSize: 12, color: T.text, lineHeight: 1.55, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{c.message}</p>
                      </td>
                      <td style={{ padding: "12px 14px", minWidth: 140, maxWidth: 220 }}>
                        {c.pmMessage
                          ? <p style={{ margin: 0, fontSize: 12, color: T.muted, lineHeight: 1.55, fontStyle: "italic", wordBreak: "break-word" }}>{c.pmMessage}</p>
                          : <span style={{ fontSize: 11, color: T.subtle, fontFamily: "'JetBrains Mono', monospace" }}>—</span>
                        }
                      </td>
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        <StatusBadge value={c.status} meta={STATUS_META} />
                      </td>
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        {c.action
                          ? <StatusBadge value={c.action} meta={ACTION_META} />
                          : <span className="ops-pending" style={{
                              display: "inline-flex", alignItems: "center", gap: 5,
                              padding: "3px 9px", borderRadius: 2,
                              background: "rgba(122,112,96,0.11)", color: T.muted,
                              fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
                              fontFamily: "'Cinzel', serif",
                              border: `1px solid ${T.muted}33`,
                            }}>PENDING</span>
                        }
                      </td>
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>{fmt(c.requestedAt)}</span>
                      </td>
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        {c.scheduleAt
                          ? <span style={{ fontSize: 11, color: T.purple, fontFamily: "'JetBrains Mono', monospace" }}>{fmt(c.scheduleAt)}</span>
                          : <span style={{ fontSize: 11, color: T.subtle, fontFamily: "'JetBrains Mono', monospace" }}>—</span>
                        }
                      </td>
                      <td style={{ padding: "12px 14px", minWidth: 130, maxWidth: 200 }}>
                        {c.itMessage
                          ? <span style={{ fontSize: 11, color: T.teal, fontStyle: "italic", wordBreak: "break-word", display: "block" }}>{c.itMessage}</span>
                          : <span style={{ fontSize: 11, color: T.subtle, fontFamily: "'JetBrains Mono', monospace" }}>—</span>
                        }
                      </td>
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        {canAct ? (
                          <button className="ops-upd" onClick={() => onAction(c)}
                            style={{
                              padding: "4px 12px", borderRadius: 2,
                              background: T.amberBg, border: `1px solid ${T.amber}44`,
                              color: T.amber, fontSize: 9, fontWeight: 700,
                              letterSpacing: "0.12em", cursor: "pointer",
                              fontFamily: "'Cinzel', serif", transition: "all .15s",
                            }}
                          >UPDATE</button>
                        ) : (
                          <span style={{
                            fontSize: 9, letterSpacing: "0.12em", fontWeight: 700,
                            color: (c.status === "cancel" || c.action === "cancel") ? T.red : T.green,
                            fontFamily: "'Cinzel', serif",
                          }}>
                            {(c.status === "cancel" || c.action === "cancel") ? "CANCELLED" : "CLOSED"}
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
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════════ */
export default function PMDashboard() {
  injectFonts();

  const user   = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const addNotification = useNotifStore(s => s.addNotification);
  const unread          = useNotifStore(s => s.unread);
  const navigate        = useNavigate();

  /* ── Section state ───────────────────────────────────────────────────── */
  const [activeSection,  setActiveSection]  = useState("campaigns");
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [showNotifs,     setShowNotifs]     = useState(false);
  const [isMobile,       setIsMobile]       = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const cb = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", cb);
    return () => window.removeEventListener("resize", cb);
  }, []);

  /* ── Campaigns ───────────────────────────────────────────────────────── */
  const [campaigns,    setCampaigns]    = useState([]);
  const [camLoading,   setCamLoading]   = useState(true);
  const [actionTarget, setActionTarget] = useState(null);

  /* ── Users ───────────────────────────────────────────────────────────── */
  const [users,       setUsers]       = useState([]);
  const [userLoading, setUserLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  /* ── Create user form ────────────────────────────────────────────────── */
  const [createForm, setCreateForm] = useState({ username: "", email: "", password: "", role: "ppc" });
  const [creating,   setCreating]   = useState(false);
  const [createErr,  setCreateErr]  = useState("");
  const [createOk,   setCreateOk]   = useState(false);

  /* ── Load campaigns ──────────────────────────────────────────────────── */
  const loadCampaigns = useCallback(async () => {
    setCamLoading(true);
    try {
      const res = await api.get("/campaign/get");
      const data = res.data?.data ?? [];
      setCampaigns(data);
    } catch {
      addNotification("Failed to load campaigns");
    } finally {
      setCamLoading(false);
    }
  }, [addNotification]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  /* ── Load users (best-effort: derive from campaigns + team info) ─────── */
  const loadUsers = useCallback(async () => {
    setUserLoading(true);
    try {
      // Try a dedicated user list endpoint if it exists
      const res = await api.get("/user/list").catch(() => null);
      if (res?.data?.data) {
        setUsers(res.data.data);
      } else {
        // Derive unique createdBy users from campaigns as fallback
        const map = new Map();
        campaigns.forEach(c => {
          if (c.createdBy && !map.has(c.createdBy._id ?? c.createdBy)) {
            const u = typeof c.createdBy === "object" ? c.createdBy : { _id: c.createdBy };
            map.set(u._id, u);
          }
        });
        setUsers([...map.values()]);
      }
    } finally {
      setUserLoading(false);
    }
  }, [campaigns]);

  useEffect(() => {
    if (activeSection === "ppc-users") loadUsers();
  }, [activeSection, loadUsers]);

  /* ── Socket real-time ────────────────────────────────────────────────── */
  /* Uncomment after installing socket.io-client:
  useEffect(() => {
    const { io } = await import("socket.io-client");
    const socket = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:3000", {
      withCredentials: true,
    });
    socket.on("campaign:created",  (c) => { setCampaigns(p => [c, ...p]); addNotification(`New campaign created`); });
    socket.on("campaign:updated",  (c) => { setCampaigns(p => p.map(x => x._id === c._id ? c : x)); addNotification(`Campaign updated`); });
    socket.on("campaign:deleted",  (d) => { setCampaigns(p => p.filter(x => x._id !== d._id)); });
    socket.on("campaign:it_ack",   (c) => { setCampaigns(p => p.map(x => x._id === c._id ? c : x)); addNotification(`IT acknowledged campaign`); });
    return () => socket.disconnect();
  }, [addNotification]);
  */

  /* ── Derived lists ───────────────────────────────────────────────────── */
  const openRequests   = useMemo(() => campaigns.filter(c => c.action === "approve" && !c.acknowledgement), [campaigns]);
  const closedRequests = useMemo(() => campaigns.filter(c =>
    c.status === "cancel" || c.action === "cancel" || c.acknowledgement
  ), [campaigns]);

  /* ── Handlers ────────────────────────────────────────────────────────── */
  const handleLogout = useCallback(async () => {
    await logout();
    navigate("/login");
  }, [logout, navigate]);

  const goTo = (section) => {
    setActiveSection(section);
    setSidebarOpen(false);
    setCreateErr(""); setCreateOk(false);
  };

  const handleAction = useCallback(async (campaignId, { action, pmMessage, scheduleAt }) => {
    const res = await api.post("/campaign/update", {
      campaignId,
      action,
      pmMessage:  pmMessage  || undefined,
      scheduleAt: scheduleAt || undefined,
    });
    const updated = res.data?.data;
    if (updated) {
      setCampaigns(prev => prev.map(c => c._id === updated._id ? updated : c));
      addNotification(action === "approve" ? "Campaign approved — forwarded to IT" : "Campaign cancelled");
    }
  }, [addNotification]);

  const handleDeleteUser = useCallback(async (userId) => {
    await api.post("/user/delete", { id: userId });
    setUsers(prev => prev.filter(u => u._id !== userId));
    addNotification("User deleted successfully");
  }, [addNotification]);

  const handleCreateUser = useCallback(async (e) => {
    e.preventDefault();
    setCreateErr(""); setCreateOk(false);
    if (!createForm.username || !createForm.email || !createForm.password) {
      setCreateErr("Username, email and password are required.");
      return;
    }
    setCreating(true);
    try {
      await api.post("/user/create", createForm);
      setCreateForm({ username: "", email: "", password: "", role: "ppc" });
      setCreateOk(true);
      addNotification(`User "${createForm.username}" created`);
      setTimeout(() => setCreateOk(false), 3000);
    } catch (ex) {
      setCreateErr(ex?.response?.data?.message || "Failed to create user.");
    } finally {
      setCreating(false);
    }
  }, [createForm, addNotification]);

  /* ─────────────────────────────────────────────────────────────────────
     NAV ITEMS
  ────────────────────────────────────────────────────────────────────── */
  const NAV = [
    { id: "campaigns",      label: "Campaigns",       count: campaigns.length  },
    { id: "ppc-users",      label: "PPC Users",       count: null             },
    { id: "manage-users",   label: "Manage Users",    count: null             },
    { id: "open-requests",  label: "Open Requests",   count: openRequests.length   },
    { id: "closed-requests",label: "Closed Requests", count: closedRequests.length },
  ];

  /* ─────────────────────────────────────────────────────────────────────
     RENDER
  ────────────────────────────────────────────────────────────────────── */
  const SECTION_TITLE = {
    campaigns:       "Campaigns",
    "ppc-users":     "PPC Users",
    "manage-users":  "Manage Users",
    "open-requests": "Open Requests",
    "closed-requests":"Closed Requests",
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'DM Sans', sans-serif" }}>

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
        button:focus-visible{ outline:2px solid ${T.gold}; outline-offset:2px; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-thumb { background:${T.subtle}; border-radius:99px; }
        select option { background:${T.bgCard}; color:${T.text}; }
      `}</style>

      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 7999, background: "rgba(0,0,0,0.72)" }}
        />
      )}

      {/* ═══════════════ SIDEBAR ═══════════════════════════════════════ */}
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
            <p style={{ margin: "2px 0 0", fontSize: 8, color: T.muted, letterSpacing: "0.2em" }}>PM PANEL</p>
          </div>
        </div>

        {/* Nav */}
        <div style={{ padding: "18px 10px 10px", flex: 1 }}>
          <SectionLabel>NAVIGATION</SectionLabel>
          {NAV.map(item => {
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
                    fontWeight: 700, transition: "all .15s",
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
            }}>{initials(user || "PM")}</div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: T.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>{user || "PM User"}</p>
              <p style={{ margin: 0, fontSize: 8, color: T.muted, letterSpacing: "0.12em" }}>PROCESS MANAGER</p>
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

      {/* ═══════════════ MAIN ══════════════════════════════════════════ */}
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
              <p style={{ margin: 0, fontSize: 8, letterSpacing: "0.24em", color: T.gold, fontFamily: "'Cinzel', serif" }}>— PROCESS MANAGER</p>
              <h1 style={{ margin: "2px 0 0", fontSize: isMobile ? 17 : 22, fontWeight: 600, color: T.white, fontFamily: "'Cinzel', serif", letterSpacing: "0.02em", lineHeight: 1.1 }}>
                {SECTION_TITLE[activeSection] || "Dashboard"}
              </h1>
            </div>
          </div>

          {/* Notif bell */}
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

        {/* ── Content ─────────────────────────────────────────────────── */}
        <div style={{ padding: isMobile ? "16px 14px" : "22px 28px", flex: 1 }}>

          {/* ════════ CAMPAIGNS ════════ */}
          {activeSection === "campaigns" && (
            <div style={{ animation: "opsFadeUp .22s ease" }}>
              <CampaignsTable
                campaigns={campaigns}
                loading={camLoading}
                onAction={setActionTarget}
                isMobile={isMobile}
                title="ALL CAMPAIGNS"
                showActionBtn
              />
            </div>
          )}

          {/* ════════ PPC USERS ════════ */}
          {activeSection === "ppc-users" && (
            <div style={{ animation: "opsFadeUp .22s ease" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div style={{
                  padding: "2px 10px", borderRadius: 2,
                  background: T.goldDim, border: `1px solid ${T.goldBorder}`,
                  fontSize: 9, color: T.gold, fontFamily: "'JetBrains Mono', monospace",
                }}>{users.length} users loaded</div>
                <GoldBtn variant="outline" onClick={loadUsers}>REFRESH</GoldBtn>
              </div>

              {userLoading ? (
                <div style={{ padding: "52px 20px", textAlign: "center", color: T.muted }}>
                  <div style={{ marginBottom: 10, color: T.gold, fontSize: 22 }}>◈</div>Loading users…
                </div>
              ) : users.length === 0 ? (
                <div style={{
                  padding: "52px 20px", textAlign: "center",
                  background: T.bgCard, border: `1px solid ${T.goldBorder}`,
                  borderRadius: 4,
                }}>
                  <div style={{ fontSize: 24, color: T.subtle, marginBottom: 12, fontFamily: "'Cinzel', serif" }}>◇</div>
                  <p style={{ margin: 0, fontSize: 14, color: T.white, fontFamily: "'Cinzel', serif" }}>No Users Found</p>
                  <p style={{ margin: "6px 0 20px", fontSize: 13, color: T.muted }}>Create users from the Manage Users section.</p>
                  <GoldBtn variant="outline" onClick={() => goTo("manage-users")}>CREATE USER</GoldBtn>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
                  {users.map(u => (
                    <div key={u._id}
                      style={{
                        background: T.bgCard, border: `1px solid ${T.goldBorder}`,
                        borderRadius: 4, padding: "18px 18px 16px",
                        transition: "border-color .2s, box-shadow .2s",
                        animation: "opsFadeUp .22s ease",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = T.gold + "44"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,.4)"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = T.goldBorder; e.currentTarget.style.boxShadow = "none"; }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{
                            width: 38, height: 38, borderRadius: "50%",
                            background: T.goldDim, border: `1px solid ${T.goldBorder}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 13, fontWeight: 700, color: T.gold, fontFamily: "'Cinzel', serif",
                            flexShrink: 0,
                          }}>{initials(u.username || "U")}</div>
                          <div>
                            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.white, fontFamily: "'Cinzel', serif" }}>{u.username || "—"}</p>
                            <p style={{ margin: "2px 0 0", fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono', monospace" }}>{u.email || "—"}</p>
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
                        >DELETE</button>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 9, color: T.muted, letterSpacing: "0.12em", fontFamily: "'Cinzel', serif" }}>ROLE</span>
                          <RoleBadge role={u.role} />
                        </div>
                        {u.managerId && (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 9, color: T.muted, letterSpacing: "0.12em", fontFamily: "'Cinzel', serif" }}>MANAGER</span>
                            <span style={{ fontSize: 10, color: T.muted, fontFamily: "'JetBrains Mono', monospace", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }}>
                              {typeof u.managerId === "object" ? (u.managerId.username || u.managerId._id) : u.managerId}
                            </span>
                          </div>
                        )}
                        {u.teams && u.teams.length > 0 && (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 9, color: T.muted, letterSpacing: "0.12em", fontFamily: "'Cinzel', serif" }}>TEAMS</span>
                            <span style={{ fontSize: 10, color: T.purple, fontFamily: "'JetBrains Mono', monospace" }}>{u.teams.length} team{u.teams.length > 1 ? "s" : ""}</span>
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 9, color: T.muted, letterSpacing: "0.12em", fontFamily: "'Cinzel', serif" }}>USER ID</span>
                          <span style={{ fontSize: 9, color: T.subtle, fontFamily: "'JetBrains Mono', monospace" }}>{String(u._id || "—").slice(0, 16)}…</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ════════ MANAGE USERS ════════ */}
          {activeSection === "manage-users" && (
            <div style={{ animation: "opsFadeUp .22s ease", maxWidth: 540 }}>
              <div style={{
                padding: "13px 18px", marginBottom: 22,
                border: `1px solid ${T.goldBorder}`, borderRadius: 4,
                background: T.bgCard,
              }}>
                <p style={{ margin: 0, fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
                  As a Process Manager, you can create Manager, IT, and other Process Manager accounts. Managers can create PPC users within their team.
                </p>
              </div>

              <div style={{
                background: T.bgCard, border: `1px solid ${T.goldBorder}`,
                borderRadius: 4, padding: isMobile ? "22px 18px" : "28px 26px 24px",
              }}>
                <h2 style={{ margin: "0 0 22px", fontSize: 15, fontWeight: 600, color: T.white, fontFamily: "'Cinzel', serif", letterSpacing: "0.08em" }}>
                  Create User Account
                </h2>

                {createErr && (
                  <div style={{
                    padding: "10px 14px", borderRadius: 3, marginBottom: 18,
                    background: T.redBg, border: `1px solid ${T.red}44`,
                    color: T.red, fontSize: 12,
                  }}>{createErr}</div>
                )}

                {createOk && (
                  <div style={{
                    padding: "10px 14px", borderRadius: 3, marginBottom: 18,
                    background: T.greenBg, border: `1px solid ${T.green}44`,
                    color: T.green, fontSize: 11, fontFamily: "'Cinzel', serif", letterSpacing: "0.08em",
                  }}>✓ USER CREATED SUCCESSFULLY</div>
                )}

                <form onSubmit={handleCreateUser}>
                  <Field label="USERNAME" hint="required">
                    <input className="ops-focus" type="text" value={createForm.username}
                      onChange={e => setCreateForm(f => ({ ...f, username: e.target.value }))}
                      placeholder="e.g. john_doe" required style={inputSx}
                    />
                  </Field>
                  <Field label="EMAIL" hint="required — must be @satkartar.com or @skinrange.com">
                    <input className="ops-focus" type="email" value={createForm.email}
                      onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="user@satkartar.com" required style={inputSx}
                    />
                  </Field>
                  <Field label="PASSWORD" hint="required">
                    <input className="ops-focus" type="password" value={createForm.password}
                      onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="••••••••••" required style={inputSx}
                    />
                  </Field>
                  <Field label="ROLE" hint="required">
                    <select className="ops-focus" value={createForm.role}
                      onChange={e => setCreateForm(f => ({ ...f, role: e.target.value }))}
                      style={{ ...inputSx, cursor: "pointer" }}
                    >
                      <option value="manager">Manager</option>
                      <option value="process manager">Process Manager</option>
                      <option value="it">IT</option>
                    </select>
                  </Field>

                  <div style={{ borderTop: `1px solid ${T.subtle}`, paddingTop: 20, marginTop: 6 }}>
                    <GoldBtn type="submit" disabled={creating} style={{ width: "100%", padding: "13px" }}>
                      {creating ? "CREATING…" : "CREATE USER"}
                    </GoldBtn>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ════════ OPEN REQUESTS ════════ */}
          {activeSection === "open-requests" && (
            <div style={{ animation: "opsFadeUp .22s ease" }}>
              <div style={{
                display: "flex", gap: 12, alignItems: "center", marginBottom: 20,
                padding: "12px 18px", background: T.bgCard,
                border: `1px solid ${T.teal}33`, borderRadius: 4,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.teal, flexShrink: 0, boxShadow: `0 0 8px ${T.teal}` }} />
                <p style={{ margin: 0, fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
                  These campaigns have been <strong style={{ color: T.teal }}>approved</strong> by the Process Manager and are waiting for IT acknowledgement.
                </p>
              </div>
              <CampaignsTable
                campaigns={openRequests}
                loading={camLoading}
                onAction={setActionTarget}
                isMobile={isMobile}
                title="OPEN · AWAITING IT ACK"
                showActionBtn={false}
              />
            </div>
          )}

          {/* ════════ CLOSED REQUESTS ════════ */}
          {activeSection === "closed-requests" && (
            <div style={{ animation: "opsFadeUp .22s ease" }}>
              <div style={{
                display: "flex", gap: 12, alignItems: "center", marginBottom: 20,
                padding: "12px 18px", background: T.bgCard,
                border: `1px solid ${T.subtle}`, borderRadius: 4,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.muted, flexShrink: 0 }} />
                <p style={{ margin: 0, fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
                  These campaigns are <strong style={{ color: T.text }}>closed</strong> — either cancelled by PPC / PM, or acknowledged by IT.
                </p>
              </div>
              <CampaignsTable
                campaigns={closedRequests}
                loading={camLoading}
                onAction={setActionTarget}
                isMobile={isMobile}
                title="CLOSED · PROCESSED"
                showActionBtn={false}
              />
            </div>
          )}

        </div>
      </main>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {actionTarget && (
        <ActionModal
          campaign={actionTarget}
          onClose={() => setActionTarget(null)}
          onSave={handleAction}
        />
      )}

      {deleteTarget && (
        <DeleteUserModal
          user={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteUser}
        />
      )}
    </div>
  );
}