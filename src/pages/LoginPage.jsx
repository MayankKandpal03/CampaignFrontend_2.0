import api from "../api/axios.js";
import useAuthStore from "../stores/useAuthStore.js";
import { useState, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";

/* ═══════════════════════════════════════════════════════════════
   STATIC STAR DATA — computed once at module level
═══════════════════════════════════════════════════════════════ */
const STARS = Array.from({ length: 140 }, (_, i) => ({
  id:       i,
  size:     Math.random() * 2.2 + 0.4,
  top:      Math.random() * 100,
  left:     Math.random() * 100,
  opacity:  Math.random() * 0.75 + 0.15,
  delay:    Math.random() * 6,
  duration: Math.random() * 4 + 2.5,
}));

/* ═══════════════════════════════════════════════════════════════
   STAR BACKGROUND  (memo → never re-renders on state change)
═══════════════════════════════════════════════════════════════ */
const StarField = memo(() => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
    {STARS.map((s) => (
      <div
        key={s.id}
        className="absolute rounded-full bg-white will-change-[opacity,transform]"
        style={{
          width:     s.size,
          height:    s.size,
          top:       `${s.top}%`,
          left:      `${s.left}%`,
          opacity:   s.opacity,
          animation: `twinkle ${s.duration}s ${s.delay}s ease-in-out infinite alternate`,
        }}
      />
    ))}
  </div>
));
StarField.displayName = "StarField";

/* ═══════════════════════════════════════════════════════════════
   SPINNER
═══════════════════════════════════════════════════════════════ */
const Spinner = memo(() => (
  <svg className="anim-spinner w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    {[
      [1,    "M12 2v4"],
      [0.3,  "M12 18v4"],
      [0.8,  "M4.93 4.93l2.83 2.83"],
      [0.2,  "M16.24 16.24l2.83 2.83"],
      [0.6,  "M2 12h4"],
      [0.15, "M18 12h4"],
      [0.4,  "M4.93 19.07l2.83-2.83"],
      [0.6,  "M16.24 7.76l2.83-2.83"],
    ].map(([op, d], i) => (
      <path key={i} d={d} strokeLinecap="round" strokeOpacity={op} />
    ))}
  </svg>
));
Spinner.displayName = "Spinner";

/* ═══════════════════════════════════════════════════════════════
   INPUT CONFIG
═══════════════════════════════════════════════════════════════ */
const FIELDS = [
  { name: "email",    type: "text",     placeholder: "you@company.com", label: "Email"    },
  { name: "password", type: "password", placeholder: "••••••••••",      label: "Password" },
];

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════ */
export default function Login() {
  const setUser  = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();

  const [formData,    setFormData]    = useState({ email: "", password: "" });
  const [status,      setStatus]      = useState("idle"); // idle | loading | success | error
  const [error,       setError]       = useState("");
  const [welcomeName, setWelcomeName] = useState("");

  const isLoading = status === "loading";
  const isSuccess = status === "success";
  const isBusy    = isLoading || isSuccess;

  /* ── Original handlers — logic untouched ── */
  const handleInput = useCallback((e) => {
    setError("");
    setFormData((c) => ({ ...c, [e.target.name]: e.target.value }));
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!formData.email || !formData.password) {
      setError("Please fill in all fields.");
      return;
    }
    setError("");
    setStatus("loading");

    try {
      const { data } = await api.post("/login", formData);
      const { user } = data;
      setUser(user); // store user in zustand

      const name = user.username || user.email;
      setWelcomeName(name);
      setStatus("success");

      // Define routes for each user
      const routes = {
        ppc:               "/ppc-dashboard",
        manager:           "/manager-dashboard",
        "process manager": "/pm-dashboard",
        it:                "/it-dashboard",
      };
      setTimeout(() => navigate(routes[user.role] || "/login"), 2000);
    } catch (err) {
      console.error("Login failed:", err);
      setError(
        err?.response?.data?.message ||
        (err?.response?.status === 401
          ? "Invalid credentials. Please try again."
          : "Something went wrong. Please try again.")
      );
      setStatus("error");
    }
  }, [formData, navigate, setUser]);

  return (
    <div className="min-h-screen flex flex-col relative bg-[#050508]">

      {/* ── Keyframes ── */}
      <style>{`
        @keyframes twinkle {
          from { opacity: 0.15; transform: scale(1);    }
          to   { opacity: 1;    transform: scale(1.35); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .anim-card    { animation: fadeUp .58s cubic-bezier(.22,1,.36,1) both; }
        .anim-spinner { animation: spin .78s linear infinite; }
        .btn-label    { animation: fadeIn .22s ease both; }

        .input-spark:focus {
          animation: sparkDark 1.9s ease-in-out infinite alternate;
        }
        @keyframes sparkDark {
          from { box-shadow: 0 0 0 1px rgba(255,255,255,.18), 0 0 10px 2px rgba(255,255,255,.05); }
          to   { box-shadow: 0 0 0 1px rgba(255,255,255,.38), 0 0 22px 6px rgba(255,255,255,.11); }
        }
      `}</style>

      {/* Star background */}
      <StarField />

      {/* ══════════ HEADER ══════════ */}
      <header className="relative z-10 w-full bg-[#07070c]/90 border-b border-white/6 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-[15px] bg-white/[0.07] border border-white/10 text-white">
              X
            </div>
            <div>
              <h1 className="text-[17px] font-semibold tracking-tight leading-none text-white">
                XYZ<span className="text-white/40">.</span>
              </h1>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] mt-0.5 text-white/30">
                Campaign Suite
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ══════════ MAIN ══════════ */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-105 anim-card">

          {/* Card */}
          <div className="rounded-2xl p-9 backdrop-blur-xl bg-white/4 border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_24px_60px_rgba(0,0,0,0.6)]">

            {/* Heading — morphs to Welcome on success */}
            <div className="mb-8">
              <h2
                key={isSuccess ? "welcome" : "signin"}
                style={{ animation: "fadeIn .38s ease both" }}
                className="text-[28px] font-semibold tracking-tight leading-tight mb-2 text-white"
              >
                {isSuccess ? `Welcome, ${welcomeName}` : "Sign in"}
              </h2>
              <p className="text-[13.5px] leading-relaxed text-white/40">
                {isSuccess
                  ? "Login successful. Taking you to your dashboard…"
                  : "Access your campaign dashboard to manage requests, track approvals, and coordinate with your team."}
              </p>
            </div>

            <div className="border-t mb-7 border-white/8" />

            {/* Error banner — animated slide-in */}
            <div style={{
              maxHeight:    error ? "80px" : "0",
              opacity:      error ? 1 : 0,
              overflow:     "hidden",
              marginBottom: error ? "20px" : "0",
              transition:   "max-height .45s cubic-bezier(.22,1,.36,1), opacity .35s ease, margin-bottom .35s ease",
            }}>
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl text-[13px] font-medium bg-red-500/10 border border-red-500/20 text-red-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {FIELDS.map(({ name, type, placeholder, label }) => (
                <div key={name} className="space-y-2">
                  <label
                    htmlFor={name}
                    className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45"
                  >
                    {label}
                  </label>
                  <input
                    type={type}
                    name={name}
                    id={name}
                    placeholder={placeholder}
                    value={formData[name]}
                    onChange={handleInput}
                    disabled={isBusy}
                    className="input-spark w-full px-4 py-2.75 rounded-xl text-[13.5px] outline-none transition-colors duration-300 disabled:opacity-50 bg-white/6 border border-white/12 text-white placeholder-white/20 focus:border-white/35 focus:bg-white/8"
                  />
                </div>
              ))}

              {/* Button: idle → "Sign In →" | loading → spinner | success → "Redirecting…" */}
              <button
                type="submit"
                disabled={isBusy}
                style={{ minHeight: "44px" }}
                className={`relative w-full py-2.75 rounded-xl font-medium text-[13.5px] tracking-wide
                  flex items-center justify-center gap-2 mt-1 cursor-pointer transition-all duration-500
                  disabled:cursor-not-allowed
                  ${isBusy
                    ? "bg-white/75 text-[#050508]/70"
                    : "bg-white text-[#050508] hover:bg-white/90 shadow-[0_4px_24px_rgba(255,255,255,0.15)]"
                  }`}
              >
                <span key={status} className="btn-label flex items-center gap-2">
                  {isBusy ? (
                    <>
                      <Spinner />
                      {isSuccess ? "Redirecting…" : "Signing in…"}
                    </>
                  ) : (
                    <>
                      Sign In
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    </>
                  )}
                </span>
              </button>
            </form>

            <p className="mt-7 text-center text-[12px] text-white/25">
              Need to change your password?{" "}
              <span className="font-medium cursor-pointer text-white/55 hover:text-white transition-colors duration-200">
                Contact your admin
              </span>
            </p>
          </div>

          <p className="mt-4 text-center text-[11px] text-white/15">
            Protected by enterprise-grade security
          </p>
        </div>
      </main>

      {/* ══════════ FOOTER ══════════ */}
      <footer className="relative z-10 w-full bg-[#07070c]/80 border-t border-white/5 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-[11.5px] text-white/20">
            © {new Date().getFullYear()} XYZ Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-3.5 text-[11.5px] text-white/20">
            {["Privacy", "Terms", "Support"].map((item, i, arr) => (
              <span key={item} className="flex items-center gap-3.5">
                <span className="cursor-pointer hover:opacity-70 transition-opacity duration-200">{item}</span>
                {i < arr.length - 1 && <span className="w-1 h-1 rounded-full bg-white/10" />}
              </span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}