import { useEffect, useState, useCallback, useRef } from "react";
import useCampaignStore from "../stores/useCampaignStore.js";
import useAuthStore from "../stores/useAuthStore.js";
import useNotifStore from "../stores/useNotificationStore.js";
import api from "../api/axios.js";

/* ─────────────────────────────────────────
   STYLE INJECTION (CSS-in-JS via <style>)
───────────────────────────────────────── */
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,500;0,9..144,700;1,9..144,300&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

  :root {
    --bg:       #f5f4f0;
    --surface:  #ffffff;
    --surface2: #f9f8f5;
    --border:   #e6e3dc;
    --border2:  #d0ccC3;
    --text:     #1a1915;
    --muted:    #8c8880;
    --ink:      #3d3a34;
    --accent:   #2d6a4f;
    --accent-lt:#e8f4f0;
    --warn:     #9b4a1b;
    --warn-lt:  #fdf0e8;
    --danger:   #c0392b;
    --danger-lt:#fdf2f2;
    --info:     #1a5276;
    --info-lt:  #eaf4fb;
    --ff-display: 'Fraunces', Georgia, serif;
    --ff-body:    'DM Sans', sans-serif;
    --ff-mono:    'DM Mono', monospace;
    --sidebar-w:  240px;
    --header-h:   60px;
  }

  .it-root *, .it-root *::before, .it-root *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .it-root { font-family: var(--ff-body); font-weight: 400; color: var(--text); background: var(--bg); min-height: 100vh; display: flex; font-size: 14px; line-height: 1.6; }

  /* ── Sidebar ── */
  .it-sidebar {
    width: var(--sidebar-w);
    background: var(--surface);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0; left: 0; bottom: 0;
    z-index: 200;
    transition: transform 0.28s cubic-bezier(.4,0,.2,1);
    overflow-y: auto;
  }
  .it-sidebar.hidden { transform: translateX(-100%); }

  .sidebar-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.28);
    z-index: 199;
    backdrop-filter: blur(2px);
  }
  .sidebar-overlay.show { display: block; }

  .sidebar-brand {
    padding: 20px 24px 18px;
    border-bottom: 1px solid var(--border);
  }
  .sidebar-brand-name {
    font-family: var(--ff-display);
    font-size: 20px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.02em;
  }
  .sidebar-brand-sub {
    font-size: 11px;
    font-family: var(--ff-mono);
    color: var(--muted);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-top: 2px;
  }
  .sidebar-user {
    padding: 14px 24px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .user-avatar {
    width: 34px; height: 34px;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px;
    font-weight: 600;
    flex-shrink: 0;
    font-family: var(--ff-display);
  }
  .user-info-name { font-size: 13px; font-weight: 500; color: var(--text); }
  .user-info-role {
    font-size: 10px;
    font-family: var(--ff-mono);
    color: var(--accent);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .sidebar-nav { flex: 1; padding: 16px 12px; display: flex; flex-direction: column; gap: 2px; }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13.5px;
    font-weight: 400;
    color: var(--muted);
    transition: all 0.15s;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
  }
  .nav-item:hover { background: var(--surface2); color: var(--ink); }
  .nav-item.active { background: var(--accent-lt); color: var(--accent); font-weight: 500; }
  .nav-item .nav-icon { font-size: 16px; flex-shrink: 0; }
  .sidebar-footer { padding: 12px; border-top: 1px solid var(--border); }
  .logout-btn {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 12px;
    border-radius: 8px;
    width: 100%; border: none; background: none;
    font-family: var(--ff-body); font-size: 13px;
    color: var(--muted); cursor: pointer; transition: all 0.15s;
  }
  .logout-btn:hover { background: var(--danger-lt); color: var(--danger); }

  /* ── Main Area ── */
  .it-main {
    flex: 1;
    margin-left: var(--sidebar-w);
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    transition: margin-left 0.28s cubic-bezier(.4,0,.2,1);
  }
  .it-header {
    position: sticky; top: 0; z-index: 100;
    height: var(--header-h);
    background: rgba(245,244,240,0.92);
    border-bottom: 1px solid var(--border);
    backdrop-filter: blur(10px);
    display: flex; align-items: center;
    padding: 0 28px;
    gap: 16px;
  }
  .hamburger {
    display: none;
    flex-direction: column; gap: 5px;
    cursor: pointer; padding: 4px; border: none; background: none;
  }
  .hamburger span {
    display: block; width: 20px; height: 2px;
    background: var(--ink); border-radius: 2px;
    transition: all 0.2s;
  }
  .header-title {
    font-family: var(--ff-display);
    font-size: 18px;
    font-weight: 500;
    color: var(--text);
    flex: 1;
  }
  .header-badge {
    font-family: var(--ff-mono);
    font-size: 10px;
    padding: 3px 10px;
    border-radius: 99px;
    background: var(--accent-lt);
    color: var(--accent);
    letter-spacing: 0.05em;
  }
  .notif-bell {
    position: relative;
    width: 36px; height: 36px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    font-size: 16px;
    transition: background 0.15s;
  }
  .notif-bell:hover { background: var(--surface2); }
  .notif-dot {
    position: absolute; top: 6px; right: 6px;
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--danger);
    border: 1.5px solid var(--bg);
  }

  /* ── Content ── */
  .it-content { padding: 28px; flex: 1; max-width: 1100px; }

  /* ── Stat Cards ── */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin-bottom: 24px;
  }
  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 18px 20px;
  }
  .stat-label {
    font-size: 11px;
    font-family: var(--ff-mono);
    color: var(--muted);
    letter-spacing: 0.07em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .stat-value {
    font-family: var(--ff-display);
    font-size: 28px;
    font-weight: 700;
    color: var(--text);
    line-height: 1;
  }
  .stat-sub { font-size: 12px; color: var(--muted); margin-top: 4px; }

  /* ── Section header ── */
  .section-head {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 16px;
  }
  .section-title {
    font-family: var(--ff-display);
    font-size: 16px;
    font-weight: 500;
    color: var(--text);
  }
  .refresh-btn {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; color: var(--muted);
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    cursor: pointer;
    transition: all 0.15s;
    font-family: var(--ff-body);
  }
  .refresh-btn:hover { border-color: var(--border2); color: var(--ink); background: var(--surface2); }

  /* ── Table ── */
  .table-wrap {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }
  .table-empty {
    padding: 48px 24px;
    text-align: center;
  }
  .table-empty-icon { font-size: 32px; margin-bottom: 10px; }
  .table-empty-text { font-size: 14px; color: var(--muted); }

  table { width: 100%; border-collapse: collapse; }
  thead tr { border-bottom: 1px solid var(--border); background: var(--surface2); }
  th {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--muted);
    padding: 12px 16px;
    text-align: left;
    font-weight: 400;
  }
  tbody tr {
    border-bottom: 1px solid var(--border);
    transition: background 0.12s;
  }
  tbody tr:last-child { border-bottom: none; }
  tbody tr:hover { background: var(--surface2); }
  td { padding: 14px 16px; font-size: 13px; color: var(--ink); vertical-align: middle; }

  /* ── Badges ── */
  .badge {
    display: inline-flex;
    align-items: center;
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.04em;
    padding: 3px 9px;
    border-radius: 99px;
    font-weight: 500;
  }
  .badge-approve  { background: var(--accent-lt);  color: var(--accent);  }
  .badge-done     { background: #e0f4ed;            color: #1a6640;        }
  .badge-cancel   { background: var(--danger-lt);   color: var(--danger);  }
  .badge-pending  { background: #fef8e8;            color: #9b6a1a;        }
  .badge-notdone  { background: var(--warn-lt);     color: var(--warn);    }
  .badge-transfer { background: var(--info-lt);     color: var(--info);    }

  .msg-cell {
    max-width: 200px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .time-cell {
    font-family: var(--ff-mono);
    font-size: 11px;
    color: var(--muted);
  }

  /* ── Acknowledge Button ── */
  .ack-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-family: var(--ff-body);
    font-weight: 500;
    padding: 6px 14px;
    border-radius: 7px;
    border: 1.5px solid var(--accent);
    background: transparent;
    color: var(--accent);
    cursor: pointer;
    transition: all 0.15s;
  }
  .ack-btn:hover { background: var(--accent); color: #fff; }

  /* ── Modal Overlay ── */
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(26,25,21,0.45);
    backdrop-filter: blur(4px);
    z-index: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: fadeIn 0.18s ease;
  }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }

  .modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    width: 100%;
    max-width: 480px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.18);
    animation: slideUp 0.22s cubic-bezier(.22,1,.36,1);
    overflow: hidden;
  }
  @keyframes slideUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }

  .modal-header {
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }
  .modal-title {
    font-family: var(--ff-display);
    font-size: 17px;
    font-weight: 500;
    color: var(--text);
  }
  .modal-subtitle { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .modal-close {
    width: 30px; height: 30px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: none;
    cursor: pointer;
    font-size: 14px;
    color: var(--muted);
    transition: all 0.15s;
    display: flex; align-items: center; justify-content: center;
  }
  .modal-close:hover { background: var(--surface2); color: var(--text); }

  .modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }

  .field-group { display: flex; flex-direction: column; gap: 6px; }
  .field-label {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--muted);
  }
  textarea, input[type="text"], input[type="password"] {
    width: 100%;
    padding: 10px 12px;
    border: 1.5px solid var(--border);
    border-radius: 8px;
    font-family: var(--ff-body);
    font-size: 13.5px;
    color: var(--text);
    background: var(--surface);
    outline: none;
    transition: border-color 0.15s;
    resize: none;
  }
  textarea:focus, input[type="text"]:focus, input[type="password"]:focus { border-color: var(--accent); }
  textarea { min-height: 80px; }

  /* ── Toggle Buttons (Done / Not Done) ── */
  .toggle-row { display: flex; gap: 10px; }
  .toggle-btn {
    flex: 1;
    padding: 9px 12px;
    border-radius: 9px;
    border: 1.5px solid var(--border);
    background: none;
    font-family: var(--ff-body);
    font-size: 13px;
    font-weight: 400;
    cursor: pointer;
    transition: all 0.15s;
    display: flex; align-items: center; justify-content: center; gap: 7px;
  }
  .toggle-btn:hover { border-color: var(--border2); background: var(--surface2); }
  .toggle-btn.selected-done { background: var(--accent-lt); border-color: var(--accent); color: var(--accent); font-weight: 500; }
  .toggle-btn.selected-notdone { background: var(--warn-lt); border-color: var(--warn); color: var(--warn); font-weight: 500; }

  /* ── Modal Footer Buttons ── */
  .modal-footer {
    padding: 14px 24px 20px;
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    border-top: 1px solid var(--border);
  }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    padding: 8px 18px;
    border-radius: 8px;
    font-family: var(--ff-body);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    border: none;
  }
  .btn-ghost {
    background: none;
    border: 1.5px solid var(--border);
    color: var(--muted);
  }
  .btn-ghost:hover { border-color: var(--border2); color: var(--ink); background: var(--surface2); }
  .btn-confirm {
    background: var(--accent);
    color: #fff;
    border: 1.5px solid transparent;
  }
  .btn-confirm:hover { background: #235840; }
  .btn-confirm:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Notification Toast ── */
  .toast-container {
    position: fixed; top: 70px; right: 20px;
    z-index: 999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  }
  .toast {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--ink);
    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    max-width: 300px;
    animation: toastIn 0.25s ease;
    border-left: 3px solid var(--accent);
  }
  .toast.warn { border-left-color: var(--warn); }
  @keyframes toastIn { from { opacity:0; transform:translateX(20px) } to { opacity:1; transform:translateX(0) } }

  /* ── Reset Password Form ── */
  .form-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 28px 32px;
    max-width: 440px;
  }
  .form-title {
    font-family: var(--ff-display);
    font-size: 20px;
    font-weight: 500;
    margin-bottom: 4px;
  }
  .form-sub { font-size: 13px; color: var(--muted); margin-bottom: 22px; }
  .form-fields { display: flex; flex-direction: column; gap: 16px; }
  .input-wrap { position: relative; }
  .input-wrap input { padding-right: 40px; }
  .eye-btn {
    position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
    background: none; border: none; cursor: pointer; color: var(--muted); font-size: 15px;
    padding: 2px;
  }
  .pass-strength {
    display: flex; gap: 4px; margin-top: 6px;
  }
  .pass-bar {
    flex: 1; height: 3px; border-radius: 99px;
    background: var(--border);
    transition: background 0.3s;
  }
  .pass-bar.weak { background: var(--danger); }
  .pass-bar.medium { background: var(--accent3, #f59e0b); }
  .pass-bar.strong { background: var(--accent); }
  .pass-label { font-size: 11px; color: var(--muted); margin-top: 3px; font-family: var(--ff-mono); }
  .form-error { font-size: 12px; color: var(--danger); margin-top: 4px; }
  .form-success {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px;
    background: var(--accent-lt);
    border-radius: 8px;
    font-size: 13px;
    color: var(--accent);
    border: 1px solid #b2dfce;
  }
  .btn-primary-full {
    width: 100%; padding: 11px;
    background: var(--accent); color: #fff;
    border: none; border-radius: 9px;
    font-family: var(--ff-body); font-size: 14px; font-weight: 500;
    cursor: pointer; transition: background 0.15s;
    margin-top: 6px;
  }
  .btn-primary-full:hover { background: #235840; }
  .btn-primary-full:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .it-sidebar { transform: translateX(-100%); }
    .it-sidebar.mobile-open { transform: translateX(0); }
    .it-main { margin-left: 0; }
    .hamburger { display: flex; }
    .stats-row { grid-template-columns: repeat(2, 1fr); }
    .it-content { padding: 18px 16px; }
    th:nth-child(3), td:nth-child(3),
    th:nth-child(4), td:nth-child(4) { display: none; }
  }
  @media (max-width: 480px) {
    .stats-row { grid-template-columns: 1fr; }
    .modal { border-radius: 12px; }
    th:nth-child(2), td:nth-child(2) { display: none; }
  }
`;

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
const formatTime = (str) => {
  if (!str) return "—";
  const d = new Date(str);
  return isNaN(d) ? str : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

const getInitials = (name = "") =>
  name.split(" ").map((w) => w[0]?.toUpperCase()).join("").slice(0, 2) || "IT";

const StatusBadge = ({ value }) => {
  const map = {
    approve: ["badge-approve", "Approved"],
    done: ["badge-done", "Done"],
    cancel: ["badge-cancel", "Cancelled"],
    transfer: ["badge-transfer", "Transfer"],
    "not done": ["badge-notdone", "Not Done"],
    pending: ["badge-pending", "Pending"],
  };
  const [cls, label] = map[value] || ["badge-pending", value || "—"];
  return <span className={`badge ${cls}`}>{label}</span>;
};

/* ─────────────────────────────────────────
   ACK MODAL
───────────────────────────────────────── */
function AckModal({ campaign, onClose, onConfirm, loading }) {
  const [choice, setChoice] = useState(null);
  const [message, setMessage] = useState("done");

  const canConfirm = choice && (choice === "done" || (choice === "not done" && message.trim().length > 3));

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">Acknowledge Campaign</div>
            <div className="modal-subtitle">
              {campaign.message?.slice(0, 60)}{campaign.message?.length > 60 ? "…" : ""}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="field-group">
            <label className="field-label">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={choice === "not done" ? "Describe why this campaign could not be executed…" : "done"}
              rows={3}
            />
            {choice === "not done" && message.trim().length < 4 && (
              <span style={{ fontSize: 11, color: "var(--warn)" }}>Please add a reason (min 4 chars)</span>
            )}
          </div>

          <div className="field-group">
            <label className="field-label">Outcome</label>
            <div className="toggle-row">
              <button
                className={`toggle-btn ${choice === "done" ? "selected-done" : ""}`}
                onClick={() => { setChoice("done"); setMessage("done"); }}
              >
                ✓ Done
              </button>
              <button
                className={`toggle-btn ${choice === "not done" ? "selected-notdone" : ""}`}
                onClick={() => { setChoice("not done"); setMessage(""); }}
              >
                ✗ Not Done
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>
            Discard
          </button>
          <button
            className="btn btn-confirm"
            disabled={!canConfirm || loading}
            onClick={() => onConfirm({ acknowledgement: choice, itMessage: message })}
          >
            {loading ? "Saving…" : "Confirm →"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   RESET PASSWORD
───────────────────────────────────────── */
function ResetPassword() {
  const [form, setForm] = useState({ old: "", newP: "", confirm: "" });
  const [show, setShow] = useState({ old: false, newP: false, confirm: false });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const strength = (p) => {
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8) s++;
    if (/[A-Z]/.test(p) && /[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  };
  const s = strength(form.newP);
  const sLabel = ["", "Weak", "Medium", "Strong"][s];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.old || !form.newP || !form.confirm) return setError("Please fill all fields.");
    if (form.newP !== form.confirm) return setError("New passwords do not match.");
    if (form.newP.length < 8) return setError("Password must be at least 8 characters.");
    setLoading(true);
    try {
      await api.post("/change-password", { oldPassword: form.old, newPassword: form.newP });
      setSuccess(true);
      setForm({ old: "", newP: "", confirm: "" });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to change password.");
    } finally {
      setLoading(false);
    }
  };

  const EyeToggle = ({ field }) => (
    <button type="button" className="eye-btn" onClick={() => setShow((p) => ({ ...p, [field]: !p[field] }))}>
      {show[field] ? "🙈" : "👁"}
    </button>
  );

  return (
    <div className="form-card">
      <div className="form-title">Reset Password</div>
      <div className="form-sub">Update your account password. Choose a strong, unique password.</div>

      {success && (
        <div className="form-success" style={{ marginBottom: 16 }}>
          ✓ Password changed successfully.
        </div>
      )}

      <form className="form-fields" onSubmit={handleSubmit}>
        {[
          { key: "old", label: "Current Password", ph: "Enter current password" },
          { key: "newP", label: "New Password", ph: "Min 8 characters" },
          { key: "confirm", label: "Confirm New Password", ph: "Repeat new password" },
        ].map(({ key, label, ph }) => (
          <div className="field-group" key={key}>
            <label className="field-label">{label}</label>
            <div className="input-wrap">
              <input
                type={show[key] ? "text" : "password"}
                placeholder={ph}
                value={form[key]}
                onChange={(e) => { setError(""); setSuccess(false); setForm((p) => ({ ...p, [key]: e.target.value })); }}
              />
              <EyeToggle field={key} />
            </div>
            {key === "newP" && form.newP && (
              <>
                <div className="pass-strength">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className={`pass-bar ${s > i ? (s === 1 ? "weak" : s === 2 ? "medium" : "strong") : ""}`}
                    />
                  ))}
                </div>
                <span className="pass-label">{sLabel}</span>
              </>
            )}
          </div>
        ))}

        {error && <div className="form-error">⚠ {error}</div>}

        <button className="btn-primary-full" type="submit" disabled={loading}>
          {loading ? "Updating…" : "Update Password"}
        </button>
      </form>
    </div>
  );
}

/* ─────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────── */
export default function ITDashboard() {
  const campaigns = useCampaignStore((s) => s.campaigns);
  const getCampaign = useCampaignStore((s) => s.getCampaign);
  const updateCampaign = useCampaignStore((s) => s.updateCampaign);
  const { user, role, logout } = useAuthStore();
  const addNotification = useNotifStore((s) => s.addNotification);
  const unread = useNotifStore((s) => s.unread);

  const [tab, setTab] = useState("campaigns");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ackTarget, setAckTarget] = useState(null);
  const [ackLoading, setAckLoading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const toastRef = useRef(null);

  const pushToast = useCallback((msg, type = "success") => {
    const id = Date.now();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);

  useEffect(() => { getCampaign().catch(console.error); }, [getCampaign]);

  // IT sees campaigns where action === "approve" and acknowledgement is not "done"
  const itCampaigns = campaigns.filter(
    (c) => c.action === "approve" && c.acknowledgement !== "done"
  );
  const doneCount = campaigns.filter((c) => c.acknowledgement === "done").length;
  const pendingCount = itCampaigns.length;

  const handleRefresh = async () => {
    setRefreshing(true);
    await getCampaign().catch(console.error);
    setRefreshing(false);
    pushToast("Campaigns refreshed");
  };

  const handleAck = async ({ acknowledgement, itMessage }) => {
    if (!ackTarget) return;
    setAckLoading(true);
    try {
      await updateCampaign(ackTarget._id, { acknowledgement, itMessage });

      if (acknowledgement === "done") {
        addNotification(`✅ IT: Campaign "${ackTarget.message?.slice(0, 30)}…" marked as Done by ${user}`);
        pushToast("Campaign acknowledged as Done. PMs & owner notified.");
      } else {
        addNotification(`⚠ IT: "${ackTarget.message?.slice(0, 30)}…" marked Not Done — Reason: ${itMessage}`);
        pushToast("Reason sent to Process Manager.", "warn");
      }
      setAckTarget(null);
    } catch (err) {
      pushToast("Failed to update. Please retry.", "warn");
    } finally {
      setAckLoading(false);
    }
  };

  const NAV = [
    { id: "campaigns", icon: "📋", label: "Scheduled Campaigns" },
    { id: "password",  icon: "🔑", label: "Reset Password" },
  ];

  return (
    <>
      <style>{STYLES}</style>
      <div className="it-root">

        {/* Sidebar overlay */}
        <div
          className={`sidebar-overlay ${sidebarOpen ? "show" : ""}`}
          onClick={() => setSidebarOpen(false)}
        />

        {/* ── Sidebar ── */}
        <aside className={`it-sidebar ${sidebarOpen ? "mobile-open" : ""}`}>
          <div className="sidebar-brand">
            <div className="sidebar-brand-name">Campaign<i style={{ fontStyle: "normal", opacity: 0.4 }}>.</i></div>
            <div className="sidebar-brand-sub">IT Portal</div>
          </div>

          <div className="sidebar-user">
            <div className="user-avatar">{getInitials(user || "IT")}</div>
            <div>
              <div className="user-info-name">{user || "IT User"}</div>
              <div className="user-info-role">{role}</div>
            </div>
          </div>

          <nav className="sidebar-nav">
            {NAV.map((n) => (
              <button
                key={n.id}
                className={`nav-item ${tab === n.id ? "active" : ""}`}
                onClick={() => { setTab(n.id); setSidebarOpen(false); }}
              >
                <span className="nav-icon">{n.icon}</span>
                {n.label}
              </button>
            ))}
          </nav>

          <div className="sidebar-footer">
            <button className="logout-btn" onClick={logout}>
              <span>↩</span> Sign Out
            </button>
          </div>
        </aside>

        {/* ── Main ── */}
        <div className="it-main">
          <header className="it-header">
            <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <span /><span /><span />
            </button>
            <h1 className="header-title">
              {tab === "campaigns" ? "Scheduled Campaigns" : "Reset Password"}
            </h1>
            {tab === "campaigns" && (
              <span className="header-badge">{pendingCount} Pending</span>
            )}
            <div
              className="notif-bell"
              title={`${unread} unread notifications`}
              onClick={() => pushToast(`You have ${unread} notification(s)`)}
            >
              🔔
              {unread > 0 && <span className="notif-dot" />}
            </div>
          </header>

          <div className="it-content">

            {/* ─── CAMPAIGNS TAB ─── */}
            {tab === "campaigns" && (
              <>
                <div className="stats-row">
                  <div className="stat-card">
                    <div className="stat-label">Pending Action</div>
                    <div className="stat-value">{pendingCount}</div>
                    <div className="stat-sub">Awaiting acknowledgement</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Completed</div>
                    <div className="stat-value">{doneCount}</div>
                    <div className="stat-sub">Acknowledged as done</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Total Received</div>
                    <div className="stat-value">{campaigns.filter(c => c.action === "approve").length}</div>
                    <div className="stat-sub">Approved by PM</div>
                  </div>
                </div>

                <div className="section-head">
                  <span className="section-title">Request Queue</span>
                  <button className="refresh-btn" onClick={handleRefresh} disabled={refreshing}>
                    {refreshing ? "⟳ Refreshing…" : "⟳ Refresh"}
                  </button>
                </div>

                <div className="table-wrap">
                  {itCampaigns.length === 0 ? (
                    <div className="table-empty">
                      <div className="table-empty-icon">✅</div>
                      <div className="table-empty-text">No pending campaigns. Queue is clear.</div>
                    </div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Campaign Message</th>
                          <th>Scheduled At</th>
                          <th>Requested At</th>
                          <th>PM Note</th>
                          <th>Status</th>
                          <th>Action</th>
                          <th>Acknowledge</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itCampaigns.map((c) => (
                          <tr key={c._id}>
                            <td className="msg-cell" title={c.message}>{c.message || "—"}</td>
                            <td className="time-cell">{formatTime(c.scheduleAt)}</td>
                            <td className="time-cell">{formatTime(c.requestedAt)}</td>
                            <td className="msg-cell" title={c.pmMessage}>{c.pmMessage || "—"}</td>
                            <td><StatusBadge value={c.status} /></td>
                            <td><StatusBadge value={c.action} /></td>
                            <td>
                              <button
                                className="ack-btn"
                                onClick={() => setAckTarget(c)}
                              >
                                ✓ Acknowledge
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}

            {/* ─── RESET PASSWORD TAB ─── */}
            {tab === "password" && <ResetPassword />}
          </div>
        </div>

        {/* ── Ack Modal ── */}
        {ackTarget && (
          <AckModal
            campaign={ackTarget}
            onClose={() => setAckTarget(null)}
            onConfirm={handleAck}
            loading={ackLoading}
          />
        )}

        {/* ── Toast Notifications ── */}
        <div className="toast-container">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.type === "warn" ? "warn" : ""}`}>
              {t.msg}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}