import { useState, useRef, useEffect, useCallback } from "react";

/* ── Helpers ──────────────────────────────────────────────── */
const stripHtml = (html = "") => {
  try {
    const d = document.createElement("div");
    d.innerHTML = html;
    return (d.textContent || d.innerText || "").replace(/\s+/g, " ").trim().slice(0, 320);
  } catch { return String(html).slice(0, 320); }
};
const timeAgo = (d) => {
  try {
    const s = (Date.now() - new Date(d)) / 1000;
    if (s < 3600)   return `${Math.floor(s / 60)}m ago`;
    if (s < 86400)  return `${Math.floor(s / 3600)}h ago`;
    if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
    return new Date(d).toLocaleDateString();
  } catch { return "Recently"; }
};
const fmtSalary = (mn, mx, c = "$") => {
  if (!mn && !mx) return "Competitive";
  const f = n => n >= 1000 ? `${c}${Math.round(n / 1000)}k` : `${c}${n}`;
  if (mn && mx) return `${f(mn)}–${f(mx)}/yr`;
  return mn ? `${f(mn)}+/yr` : `Up to ${f(mx)}/yr`;
};
const empType = (r = "") => {
  const u = r.toUpperCase();
  if (u.includes("FULL"))  return "Full-time";
  if (u.includes("PART"))  return "Part-time";
  if (u.includes("CONT") || u.includes("TEMP")) return "Contract";
  if (u.includes("INTERN")) return "Internship";
  if (u.includes("REMOTE")) return "Remote";
  return r || "Full-time";
};
const hasVal = (v) => v && v.trim().length > 0;

/* ── localStorage helpers (works in any real browser) ──────── */
const lsGet = (key, fallback = "") => {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
};
const lsSet = (key, val) => {
  try { localStorage.setItem(key, val); } catch {}
};

/* ── Settings config ─────────────────────────────────────── */
const SETTINGS_CONFIG = [
  {
    id: "remotive", name: "Remotive", icon: "🌐", color: "#ef4444", noKey: true,
    freeInfo: "Unlimited · No key needed",
    description: "Remote-only job board. Works instantly without any key.",
    getKeyUrl: null, fields: [],
  },
  {
    id: "arbeitnow", name: "Arbeitnow", icon: "💼", color: "#3b82f6", noKey: true,
    freeInfo: "Unlimited · No key needed",
    description: "Global job board. No signup required.",
    getKeyUrl: null, fields: [],
  },
  {
    id: "themuse", name: "The Muse", icon: "✨", color: "#10b981", noKey: true,
    freeInfo: "500 req/day · No key needed",
    description: "Culture-first job listings.",
    getKeyUrl: null, fields: [],
  },
  {
    id: "jsearch", name: "JSearch", icon: "⚡", color: "#f59e0b", noKey: false,
    freeInfo: "500 req/month free",
    description: "Aggregates Indeed, LinkedIn, Glassdoor & 20+ boards via RapidAPI.",
    getKeyUrl: "https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch",
    fields: [{ key: "JSEARCH_RAPIDAPI", label: "RapidAPI Key", placeholder: "e.g. a1b2c3…", type: "password" }],
  },
  {
    id: "adzuna", name: "Adzuna", icon: "🔎", color: "#ec4899", noKey: false,
    freeInfo: "250 req/day free",
    description: "15M+ listings across 16 countries.",
    getKeyUrl: "https://developer.adzuna.com/",
    fields: [
      { key: "ADZUNA_APP_ID",  label: "App ID",  placeholder: "e.g. a1b2c3d4", type: "text" },
      { key: "ADZUNA_APP_KEY", label: "App Key", placeholder: "e.g. e5f6g7h8…", type: "password" },
    ],
  },
  {
    id: "reed", name: "Reed.co.uk", icon: "🇬🇧", color: "#a855f7", noKey: false,
    freeInfo: "Free tier · UK-focused",
    description: "UK's largest job site — 250k+ live listings.",
    getKeyUrl: "https://www.reed.co.uk/developers/jobseeker",
    fields: [{ key: "REED_API_KEY", label: "API Key", placeholder: "e.g. a1b2-…", type: "password" }],
  },
];

/* ── API factory ─────────────────────────────────────────── */
const makeApis = (keys, proxyUrl) => {
  const px = proxyUrl?.trim().replace(/\/$/, "");

  const endpoint = (directUrl, proxyPath, params) =>
    px ? `${px}/${proxyPath}?${params}` : `${directUrl}?${params}`;

  return [
    /* 1 — Remotive */
    {
      id: "remotive", name: "Remotive", color: "#ef4444", enabled: true,
      async search(role) {
        const p = new URLSearchParams({ search: role, limit: "20" });
        const r = await fetch(endpoint("https://remotive.com/api/remote-jobs", "remotive", p),
          { signal: AbortSignal.timeout(10000) });
        if (r.status === 429) throw { type: "rate_limit" };
        if (!r.ok) throw { type: "error" };
        const { jobs = [] } = await r.json();
        if (!jobs.length) throw { type: "empty" };
        return jobs.slice(0, 12).map(j => ({
          id: `rem-${j.id}`, title: j.title, company: j.company_name || "—",
          location: j.candidate_required_location || "Remote", salary: j.salary || "Competitive",
          type: "Remote", source: "Remotive", sourceColor: "#ef4444",
          posted: timeAgo(j.publication_date), description: stripHtml(j.description),
          requirements: (j.tags || []).slice(0, 6),
          logo: (j.company_name || "R")[0].toUpperCase(), logoColor: "#7f1d1d",
          applyUrl: j.url || "#",
        }));
      },
    },
    /* 2 — Arbeitnow */
    {
      id: "arbeitnow", name: "Arbeitnow", color: "#3b82f6", enabled: true,
      async search(role) {
        const p = new URLSearchParams({ search: role });
        const r = await fetch(endpoint("https://www.arbeitnow.com/api/job-board-api", "arbeitnow", p),
          { signal: AbortSignal.timeout(10000) });
        if (r.status === 429) throw { type: "rate_limit" };
        if (!r.ok) throw { type: "error" };
        const { data: jobs = [] } = await r.json();
        if (!jobs.length) throw { type: "empty" };
        return jobs.slice(0, 12).map(j => ({
          id: `arb-${j.slug}`, title: j.title, company: j.company_name || "—",
          location: j.location || (j.remote ? "Remote" : "On-site"), salary: "Competitive",
          type: j.remote ? "Remote" : empType(j.job_types?.[0] || ""),
          source: "Arbeitnow", sourceColor: "#3b82f6",
          posted: j.created_at ? timeAgo(new Date(j.created_at * 1000)) : "Recently",
          description: stripHtml(j.description), requirements: (j.tags || []).slice(0, 6),
          logo: (j.company_name || "A")[0].toUpperCase(), logoColor: "#1e3a8a",
          applyUrl: j.url || "#",
        }));
      },
    },
    /* 3 — The Muse */
    {
      id: "themuse", name: "The Muse", color: "#10b981", enabled: true,
      async search(role) {
        const p = new URLSearchParams({ descending: "true", page: "1" });
        const r = await fetch(endpoint("https://www.themuse.com/api/public/jobs", "themuse", p),
          { signal: AbortSignal.timeout(10000) });
        if (r.status === 429) throw { type: "rate_limit" };
        if (!r.ok) throw { type: "error" };
        const { results = [] } = await r.json();
        const words = role.toLowerCase().split(/\s+/);
        const filtered = results.filter(j => words.some(w =>
          j.name?.toLowerCase().includes(w) ||
          j.categories?.some(c => c.name?.toLowerCase().includes(w))
        ));
        if (!filtered.length) throw { type: "empty" };
        return filtered.slice(0, 10).map(j => ({
          id: `muse-${j.id}`, title: j.name, company: j.company?.name || "Company",
          location: j.locations?.[0]?.name || "Remote", salary: "Competitive",
          type: empType(j.type || ""), source: "The Muse", sourceColor: "#10b981",
          posted: j.publication_date ? timeAgo(j.publication_date) : "Recently",
          description: stripHtml(j.contents),
          requirements: (j.categories || []).map(c => c.name).slice(0, 6),
          logo: (j.company?.name || "M")[0].toUpperCase(), logoColor: "#064e3b",
          applyUrl: j.refs?.landing_page || "#",
        }));
      },
    },
    /* 4 — JSearch */
    {
      id: "jsearch", name: "JSearch", color: "#f59e0b",
      enabled: hasVal(keys.JSEARCH_RAPIDAPI),
      async search(role, loc) {
        const q = [role, loc].filter(Boolean).join(" in ");
        const p = new URLSearchParams({ query: q, page: "1", num_pages: "2" });
        const r = await fetch(
          endpoint("https://jsearch.p.rapidapi.com/search", "jsearch", p),
          {
            signal: AbortSignal.timeout(12000),
            headers: { "X-RapidAPI-Key": keys.JSEARCH_RAPIDAPI, "X-RapidAPI-Host": "jsearch.p.rapidapi.com" },
          }
        );
        if (r.status === 429) throw { type: "rate_limit" };
        if (r.status === 401 || r.status === 403) throw { type: "auth" };
        if (!r.ok) throw { type: "error" };
        const { data: jobs = [] } = await r.json();
        if (!jobs.length) throw { type: "empty" };
        return jobs.slice(0, 15).map(j => ({
          id: `js-${j.job_id}`, title: j.job_title, company: j.employer_name || "—",
          location: [j.job_city, j.job_state, j.job_country].filter(Boolean).join(", ") || "Remote",
          salary: fmtSalary(j.job_min_salary, j.job_max_salary),
          type: empType(j.job_employment_type || ""),
          source: j.job_publisher || "JSearch", sourceColor: "#f59e0b",
          posted: j.job_posted_at_datetime_utc ? timeAgo(j.job_posted_at_datetime_utc) : "Recently",
          description: stripHtml(j.job_description),
          requirements: (j.job_required_skills || j.job_highlights?.Qualifications || []).slice(0, 6),
          logo: (j.employer_name || "J")[0].toUpperCase(), logoColor: "#78350f",
          applyUrl: j.job_apply_link || "#",
        }));
      },
    },
    /* 5 — Adzuna */
    {
      id: "adzuna", name: "Adzuna", color: "#ec4899",
      enabled: hasVal(keys.ADZUNA_APP_ID) && hasVal(keys.ADZUNA_APP_KEY),
      async search(role, loc) {
        const p = new URLSearchParams({
          app_id: keys.ADZUNA_APP_ID, app_key: keys.ADZUNA_APP_KEY,
          results_per_page: "20", what: role,
          ...(loc ? { where: loc } : {}), "content-type": "application/json",
        });
        const r = await fetch(
          endpoint("https://api.adzuna.com/v1/api/jobs/us/search/1", "adzuna", p),
          { signal: AbortSignal.timeout(12000) }
        );
        if (r.status === 429) throw { type: "rate_limit" };
        if (r.status === 401 || r.status === 403) throw { type: "auth" };
        if (!r.ok) throw { type: "error" };
        const { results: jobs = [] } = await r.json();
        if (!jobs.length) throw { type: "empty" };
        return jobs.slice(0, 15).map(j => ({
          id: `adz-${j.id}`, title: j.title, company: j.company?.display_name || "—",
          location: j.location?.display_name || "—", salary: fmtSalary(j.salary_min, j.salary_max),
          type: empType(j.contract_type || j.contract_time || ""),
          source: "Adzuna", sourceColor: "#ec4899",
          posted: j.created ? timeAgo(j.created) : "Recently",
          description: stripHtml(j.description), requirements: [],
          logo: (j.company?.display_name || "A")[0].toUpperCase(), logoColor: "#831843",
          applyUrl: j.redirect_url || "#",
        }));
      },
    },
    /* 6 — Reed */
    {
      id: "reed", name: "Reed.co.uk", color: "#a855f7",
      enabled: hasVal(keys.REED_API_KEY),
      async search(role, loc) {
        const p = new URLSearchParams({ keywords: role, resultsToTake: "20", ...(loc ? { locationName: loc } : {}) });
        const r = await fetch(
          endpoint("https://www.reed.co.uk/api/1.0/search", "reed", p),
          {
            signal: AbortSignal.timeout(12000),
            headers: { Authorization: `Basic ${btoa(keys.REED_API_KEY + ":")}`, Accept: "application/json" },
          }
        );
        if (r.status === 429) throw { type: "rate_limit" };
        if (r.status === 401 || r.status === 403) throw { type: "auth" };
        if (!r.ok) throw { type: "error" };
        const { results: jobs = [] } = await r.json();
        if (!jobs.length) throw { type: "empty" };
        return jobs.slice(0, 15).map(j => ({
          id: `reed-${j.jobId}`, title: j.jobTitle, company: j.employerName || "—",
          location: j.locationName || "UK",
          salary: j.minimumSalary || j.maximumSalary
            ? fmtSalary(j.minimumSalary, j.maximumSalary, "£") : j.salary || "Competitive",
          type: j.fullTime === false ? "Part-time" : "Full-time",
          source: "Reed.co.uk", sourceColor: "#a855f7",
          posted: j.date ? timeAgo(j.date) : "Recently",
          description: stripHtml(j.jobDescription), requirements: [],
          logo: (j.employerName || "R")[0].toUpperCase(), logoColor: "#581c87",
          applyUrl: j.jobUrl || "#",
        }));
      },
    },
  ];
};

/* ── Status styles ───────────────────────────────────────── */
const ST = {
  idle:       { dot: "#d1d5db", label: "Waiting" },
  no_key:     { dot: "#e5e7eb", label: "No key" },
  loading:    { dot: "#f59e0b", label: "Searching…" },
  success:    { dot: "#22c55e", label: "Results found" },
  rate_limit: { dot: "#f97316", label: "Rate limited" },
  empty:      { dot: "#a5b4fc", label: "No matches" },
  auth:       { dot: "#ef4444", label: "Bad key" },
  cors:       { dot: "#ef4444", label: "CORS blocked" },
  error:      { dot: "#ef4444", label: "Failed" },
};

const TYPES = ["All Types", "Full-time", "Part-time", "Remote", "Contract", "Internship"];

/* ── Component ───────────────────────────────────────────── */
export default function App() {
  /* State */
  const [proxyUrl,     setProxyUrlRaw]  = useState(() => lsGet("js_proxy", ""));
  const [keys,         setKeys]         = useState(() => {
    try { return JSON.parse(lsGet("js_keys", "{}")) || {}; } catch { return {}; }
  });
  const [draftKeys,    setDraftKeys]    = useState(keys);
  const [showSettings, setShowSettings] = useState(false);
  const [savedFlash,   setSavedFlash]   = useState(false);
  const [showFields,   setShowFields]   = useState({});
  const [role,         setRole]         = useState("");
  const [location,     setLocation]     = useState("");
  const [typeFilter,   setTypeFilter]   = useState("All Types");
  const [srcFilter,    setSrcFilter]    = useState("All");
  const [jobs,         setJobs]         = useState([]);
  const [statuses,     setStatuses]     = useState({});
  const [apiErrors,    setApiErrors]    = useState({});
  const [running,      setRunning]      = useState(false);
  const [selectedJob,  setSelectedJob]  = useState(null);
  const [searched,     setSearched]     = useState(false);
  const [curApi,       setCurApi]       = useState("");

  const cancelRef = useRef(false);
  const inputRef  = useRef(null);
  const proxyRef  = useRef(proxyUrl);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { if (showSettings) setDraftKeys({ ...keys }); }, [showSettings]);

  const setProxyUrl = (val) => {
    const clean = val.trim().replace(/\/$/, "");
    setProxyUrlRaw(clean);
    proxyRef.current = clean;
    lsSet("js_proxy", clean);
  };

  const setSt = (id, s) => setStatuses(p => ({ ...p, [id]: s }));

  const saveKeys = () => {
    setKeys({ ...draftKeys });
    lsSet("js_keys", JSON.stringify(draftKeys));
    setSavedFlash(true);
    setTimeout(() => { setSavedFlash(false); setShowSettings(false); }, 1200);
  };

  /* ── Search ── */
  const runSearch = useCallback(async () => {
    if (!role.trim() || running) return;
    cancelRef.current = false;
    setRunning(true); setSearched(true);
    setJobs([]); setSelectedJob(null); setSrcFilter("All");
    setStatuses(Object.fromEntries(SETTINGS_CONFIG.map(a => [a.id, "idle"])));
    setApiErrors({});

    const currentProxy = proxyRef.current;
    const apis = makeApis(keys, currentProxy);

    for (const api of apis) {
      if (cancelRef.current) break;
      if (!api.enabled) { setSt(api.id, "no_key"); continue; }
      setCurApi(api.name); setSt(api.id, "loading");
      try {
        const results = await api.search(role.trim(), location.trim());
        if (cancelRef.current) break;
        setJobs(prev => {
          const seen = new Set(prev.map(j => j.id));
          return [...prev, ...results.filter(j => !seen.has(j.id))];
        });
        setSt(api.id, "success");
      } catch (err) {
        if (cancelRef.current) break;
        const isCors = err instanceof TypeError;
        let type   = err?.type || "error";
        let detail = "";
        if (isCors) { type = "cors"; detail = "Network/CORS error — is the proxy running?"; }
        else if (type === "auth")       detail = "API key rejected";
        else if (type === "rate_limit") detail = "Free quota exhausted";
        else if (type === "empty")      detail = `No "${role}" listings on this source`;
        else detail = err?.message ? String(err.message).slice(0, 100) : "Unknown error";
        setSt(api.id, type);
        setApiErrors(p => ({ ...p, [api.id]: detail }));
      }
    }
    setCurApi(""); setRunning(false);
  }, [role, location, running, keys]);

  const cancel   = () => { cancelRef.current = true; setRunning(false); setCurApi(""); };
  const handleKey = (e) => { if (e.key === "Enter") runSearch(); };

  /* Derived */
  const displayedJobs    = jobs.filter(j => {
    if (typeFilter !== "All Types" && j.type   !== typeFilter) return false;
    if (srcFilter  !== "All"       && j.source !== srcFilter)  return false;
    return true;
  });
  const availableSources = ["All", ...new Set(jobs.map(j => j.source))];
  const successCount     = Object.values(statuses).filter(s => s === "success").length;
  const configuredPaid   = SETTINGS_CONFIG.filter(a => !a.noKey && a.fields.every(f => hasVal(keys[f.key]))).length;
  const totalPaid        = SETTINGS_CONFIG.filter(a => !a.noKey).length;
  const proxySet         = hasVal(proxyUrl);
  const apis             = makeApis(keys, proxyUrl);
  const curIdx           = apis.findIndex(a => a.name === curApi);
  const totalEnabled     = apis.filter(a => a.enabled).length;
  const progress         = running && curIdx >= 0 ? Math.round((curIdx / totalEnabled) * 100) : running ? 95 : 0;

  /* ── Render ── */
  return (
    <div style={{ fontFamily: "'Inter','Segoe UI',sans-serif", minHeight: "100vh", background: "#f8fafc", color: "#0f172a" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        input, button { font-family: inherit; }
        input { outline: none; }

        .jcard { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; cursor: pointer;
          transition: border-color .15s, box-shadow .15s, transform .15s; }
        .jcard:hover { border-color: #a5b4fc; box-shadow: 0 2px 14px rgba(99,102,241,.10); transform: translateY(-1px); }
        .jcard.sel { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.08); }

        .fp { cursor: pointer; border-radius: 99px; font-size: 12px; font-weight: 500;
          padding: 4px 12px; border: 1px solid #e2e8f0; background: #fff; color: #64748b; transition: all .12s; }
        .fp:hover { border-color: #a5b4fc; color: #4f46e5; }
        .fp.on { background: #eef2ff; border-color: #c7d2fe; color: #4f46e5; }

        .btn-p { cursor: pointer; border: none; background: #4f46e5; color: #fff;
          font-weight: 600; border-radius: 10px; transition: all .13s; }
        .btn-p:hover:not(:disabled) { background: #4338ca; transform: translateY(-1px); }
        .btn-p:disabled { opacity: .35; cursor: not-allowed; }

        .btn-stop { cursor: pointer; border: none; background: #fee2e2; color: #dc2626;
          font-weight: 600; border-radius: 10px; transition: background .13s; }
        .btn-stop:hover { background: #fecaca; }

        .btn-set { cursor: pointer; border: 1px solid #e2e8f0; background: #fff;
          border-radius: 9px; color: #64748b; font-weight: 500; font-size: 12px;
          display: flex; align-items: center; gap: 6px; padding: 6px 12px; transition: all .13s; }
        .btn-set:hover { border-color: #c7d2fe; color: #4f46e5; }

        .btn-apply { cursor: pointer; border: none; font-weight: 600; border-radius: 10px;
          width: 100%; color: #fff; transition: filter .13s; }
        .btn-apply:hover { filter: brightness(1.08); }

        .fade { animation: fi .2s ease forwards; }
        @keyframes fi { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

        .pdot { animation: pd 1.2s ease-in-out infinite; }
        @keyframes pd { 0%,100% { opacity: 1; } 50% { opacity: .15; } }

        .shimmer { background: linear-gradient(90deg,#f1f5f9 25%,#e8edf5 50%,#f1f5f9 75%);
          background-size: 200% 100%; animation: sh 1.4s infinite; border-radius: 6px; }
        @keyframes sh { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

        .pbar { height: 2px; border-radius: 99px; transition: width .4s ease; background: #4f46e5; }
        .ptag { display: inline-flex; align-items: center; padding: 3px 9px;
          border-radius: 99px; font-size: 11px; font-weight: 500; white-space: nowrap; }

        .s-overlay { position: fixed; inset: 0; z-index: 200; display: flex; }
        .s-back { flex: 1; background: rgba(15,23,42,.3); backdrop-filter: blur(2px); }
        .s-panel { width: 490px; max-width: 96vw; background: #fff; border-left: 1px solid #e2e8f0;
          overflow-y: auto; display: flex; flex-direction: column;
          animation: sp .2s ease; box-shadow: -6px 0 28px rgba(15,23,42,.07); }
        @keyframes sp { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

        .s-card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; background: #fff; transition: border-color .13s; }
        .s-card.filled { border-color: #bbf7d0; background: #f0fdf4; }

        .ki-wrap { position: relative; display: flex; align-items: center; }
        .ki { width: 100%; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
          padding: 9px 68px 9px 12px; color: #0f172a; font-size: 12.5px; font-family: monospace;
          transition: border-color .13s; }
        .ki:focus { border-color: #6366f1; background: #fff; }
        .ki::placeholder { color: #cbd5e1; font-family: 'Inter', sans-serif; }
        .ki-eye { position: absolute; right: 10px; background: none; border: none;
          color: #94a3b8; cursor: pointer; font-size: 14px; padding: 0; transition: color .12s; }
        .ki-eye:hover { color: #4f46e5; }
        .ki-clr { position: absolute; right: 32px; background: none; border: none;
          color: #cbd5e1; cursor: pointer; font-size: 11px; padding: 0; transition: color .12s; }
        .ki-clr:hover { color: #ef4444; }
        .qs { cursor: pointer; border-radius: 99px; border: 1px solid #e2e8f0; background: #fff;
          color: #64748b; font-size: 12px; font-weight: 500; padding: 5px 13px; transition: all .12s; }
        .qs:hover { border-color: #c7d2fe; color: #4f46e5; }
        a { text-decoration: none; }
      `}</style>

      {/* ── TOPBAR ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #f1f5f9", padding: "0 28px",
        height: 54, display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 16, position: "sticky", top: 0, zIndex: 10 }}>

        <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "#4f46e5",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🔍</div>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -.3 }}>JobScout</span>
          <span style={{ fontSize: 11, fontWeight: 500, background: "#eef2ff", color: "#4f46e5",
            border: "1px solid #c7d2fe", padding: "1px 7px", borderRadius: 99 }}>6 Sources</span>
        </div>

        {/* Chain status pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
          {SETTINGS_CONFIG.map((cfg, i) => {
            const s  = statuses[cfg.id] || "idle";
            const st = ST[s] || ST.idle;
            const active = cfg.noKey || cfg.fields.every(f => hasVal(keys[f.key]));
            return (
              <div key={cfg.id} style={{ display: "flex", alignItems: "center", gap: i > 0 ? 4 : 0 }}>
                {i > 0 && <span style={{ color: "#e2e8f0", fontSize: 9, margin: "0 1px" }}>▸</span>}
                <div title={`${cfg.name}: ${st.label}${apiErrors[cfg.id] ? " — " + apiErrors[cfg.id] : ""}`}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px",
                    borderRadius: 99, fontSize: 11, fontWeight: 500, opacity: active ? 1 : .6,
                    background: s === "success" ? "#f0fdf4" : s === "loading" ? "#fffbeb" :
                      (s === "cors" || s === "error" || s === "auth") ? "#fff1f2" : "#f8fafc",
                    border: `1px solid ${s === "success" ? "#bbf7d0" : s === "loading" ? "#fde68a" :
                      (s === "cors" || s === "error" || s === "auth") ? "#fecdd3" : "#e2e8f0"}`,
                    color: s === "success" ? "#16a34a" : s === "loading" ? "#d97706" :
                      (s === "cors" || s === "error" || s === "auth") ? "#e11d48" : active ? "#64748b" : "#94a3b8" }}>
                  <div className={s === "loading" ? "pdot" : ""}
                    style={{ width: 5, height: 5, borderRadius: "50%", background: st.dot, flexShrink: 0 }} />
                  {cfg.name}
                </div>
              </div>
            );
          })}
        </div>

        <button className="btn-set" onClick={() => setShowSettings(true)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          API Keys
          <span style={{ fontSize: 10, fontWeight: 600, padding: "0 6px", borderRadius: 99,
            background: configuredPaid > 0 ? "#eef2ff" : "#fff7ed",
            color: configuredPaid > 0 ? "#4f46e5" : "#ea580c",
            border: `1px solid ${configuredPaid > 0 ? "#c7d2fe" : "#fed7aa"}` }}>
            {configuredPaid}/{totalPaid}
          </span>
        </button>
      </div>

      {/* ── PROXY URL BAR ── */}
      <div style={{ background: proxySet ? "#f0fdf4" : "#fffbeb",
        borderBottom: `1px solid ${proxySet ? "#bbf7d0" : "#fde68a"}`,
        padding: "8px 28px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13, flexShrink: 0 }}>{proxySet ? "✅" : "⚙️"}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: proxySet ? "#15803d" : "#92400e", flexShrink: 0 }}>
          Proxy:
        </span>
        <input
          value={proxyUrl}
          onChange={e => setProxyUrl(e.target.value)}
          placeholder="https://jobscout-proxy-production.up.railway.app"
          style={{ flex: 1, background: proxySet ? "#fff" : "#fffde7",
            border: `1px solid ${proxySet ? "#86efac" : "#fcd34d"}`,
            borderRadius: 7, padding: "5px 10px", fontSize: 12,
            color: "#0f172a", fontFamily: "monospace", outline: "none" }}
        />
        <span style={{ fontSize: 11, fontWeight: 600, flexShrink: 0,
          color: proxySet ? "#15803d" : "#92400e" }}>
          {proxySet ? "✓ Active" : "Paste your Railway URL"}
        </span>
      </div>

      {/* ── SEARCH BAR ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #f1f5f9", padding: "14px 28px 12px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: running ? 10 : 11 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", background: "#f8fafc",
            border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "0 12px", gap: 8 }}
            onFocusCapture={e => e.currentTarget.style.borderColor = "#a5b4fc"}
            onBlurCapture={e => e.currentTarget.style.borderColor = "#e2e8f0"}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round">
              <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
            </svg>
            <input ref={inputRef} value={role} onChange={e => setRole(e.target.value)} onKeyDown={handleKey}
              placeholder="Job title, role, or keyword…"
              style={{ flex: 1, background: "transparent", border: "none", color: "#0f172a", fontSize: 14, padding: "11px 0" }} />
            {role && <button onClick={() => setRole("")} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 14, padding: 0 }}>✕</button>}
          </div>
          <div style={{ display: "flex", alignItems: "center", background: "#f8fafc",
            border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "0 12px", gap: 7, minWidth: 170 }}
            onFocusCapture={e => e.currentTarget.style.borderColor = "#a5b4fc"}
            onBlurCapture={e => e.currentTarget.style.borderColor = "#e2e8f0"}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            <input value={location} onChange={e => setLocation(e.target.value)} onKeyDown={handleKey}
              placeholder="City or Remote"
              style={{ width: "100%", background: "transparent", border: "none", color: "#0f172a", fontSize: 13, padding: "11px 0" }} />
          </div>
          {running
            ? <button className="btn-stop" onClick={cancel} style={{ padding: "0 18px", fontSize: 13 }}>Stop</button>
            : <button className="btn-p" disabled={!role.trim()} onClick={runSearch} style={{ padding: "0 22px", fontSize: 13 }}>Search</button>
          }
        </div>

        {running && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ background: "#f1f5f9", borderRadius: 99, height: 2, overflow: "hidden", marginBottom: 5 }}>
              <div className="pbar" style={{ width: `${progress}%` }} />
            </div>
            <div style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 6 }}>
              <div className="pdot" style={{ width: 5, height: 5, borderRadius: "50%", background: "#4f46e5", display: "inline-block", flexShrink: 0 }} />
              Querying <strong style={{ color: "#4f46e5" }}>{curApi}</strong>
              {jobs.length > 0 && <span style={{ color: "#16a34a", marginLeft: 4 }}>· {jobs.length} jobs found</span>}
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500, marginRight: 2 }}>Type</span>
            {TYPES.map(t => (
              <button key={t} className={`fp${typeFilter === t ? " on" : ""}`} onClick={() => setTypeFilter(t)}>{t}</button>
            ))}
          </div>
          {jobs.length > 0 && <>
            <div style={{ width: 1, height: 16, background: "#e2e8f0" }} />
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500, marginRight: 2 }}>Source</span>
              {availableSources.map(s => {
                const cfg = SETTINGS_CONFIG.find(a => a.name === s);
                const col = cfg?.color || "#4f46e5";
                return (
                  <button key={s} onClick={() => setSrcFilter(s)}
                    style={{ cursor: "pointer", borderRadius: 99, fontSize: 12, fontWeight: 500,
                      padding: "4px 11px", transition: "all .12s",
                      border: `1px solid ${srcFilter === s ? col + "55" : "#e2e8f0"}`,
                      background: srcFilter === s ? col + "10" : "#fff",
                      color: srcFilter === s ? col : "#64748b" }}>
                    {s}
                  </button>
                );
              })}
            </div>
          </>}
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ display: "flex", height: "calc(100vh - 167px)" }}>

        {/* Job list */}
        <div style={{ width: selectedJob ? "400px" : "100%", overflowY: "auto",
          padding: "18px 22px", background: "#f8fafc",
          borderRight: selectedJob ? "1px solid #f1f5f9" : "none", transition: "width .22s ease" }}>

          {!searched && (
            <div style={{ maxWidth: 540, margin: "28px auto 0", textAlign: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: 13, background: "#eef2ff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, margin: "0 auto 14px" }}>🔍</div>
              <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 6 }}>Search across 6 job boards</div>
              <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.65, maxWidth: 380, margin: "0 auto" }}>
                Enter your Railway proxy URL above, then search any role. All 6 sources work with no restrictions.
              </div>
              <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #f1f5f9" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500, marginBottom: 9 }}>Popular searches</div>
                <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
                  {["Software Engineer", "Data Scientist", "Product Manager", "UX Designer", "DevOps Engineer", "Full Stack Dev"].map(r => (
                    <button key={r} className="qs" onClick={() => setRole(r)}>{r}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {running && displayedJobs.length === 0 && [...Array(5)].map((_, i) => (
            <div key={i} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 15, marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 11 }}>
                <div className="shimmer" style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div className="shimmer" style={{ height: 13, width: "55%", marginBottom: 7 }} />
                  <div className="shimmer" style={{ height: 10, width: "36%", marginBottom: 9 }} />
                  <div style={{ display: "flex", gap: 4 }}>
                    {[54, 72, 58].map((w, j) => <div key={j} className="shimmer" style={{ height: 18, width: w, borderRadius: 99 }} />)}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {searched && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{displayedJobs.length}</span>
                <span style={{ fontSize: 13, color: "#64748b" }}>
                  jobs{role && <> for <span style={{ color: "#4f46e5", fontWeight: 500 }}>"{role}"</span></>}
                </span>
                {successCount > 0 && (
                  <span style={{ fontSize: 11, color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "1px 7px", borderRadius: 99 }}>
                    {successCount} source{successCount > 1 ? "s" : ""} OK
                  </span>
                )}
              </div>
              {running && jobs.length > 0 && (
                <div style={{ fontSize: 11, color: "#4f46e5", background: "#eef2ff", border: "1px solid #c7d2fe", padding: "2px 9px", borderRadius: 99, display: "flex", alignItems: "center", gap: 5 }}>
                  <div className="pdot" style={{ width: 5, height: 5, borderRadius: "50%", background: "#4f46e5", flexShrink: 0 }} />
                  {curApi}…
                </div>
              )}
            </div>
          )}

          {displayedJobs.map((job, i) => (
            <div key={job.id || i} className={`jcard fade ${selectedJob?.id === job.id ? "sel" : ""}`}
              onClick={() => setSelectedJob(p => p?.id === job.id ? null : job)}
              style={{ marginBottom: 7, padding: "13px 15px", animationDelay: `${i * 0.02}s` }}>
              <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                  background: job.logoColor ? `${job.logoColor}15` : "#eef2ff",
                  border: `1px solid ${job.logoColor ? job.logoColor + "25" : "#e0e7ff"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 15, fontWeight: 700, color: job.logoColor || "#4f46e5" }}>
                  {job.logo || (job.company || "?")[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#0f172a", marginBottom: 1,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.title}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 7 }}>{job.company} · {job.location}</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <span className="ptag" style={{ background: "#eef2ff", color: "#4f46e5" }}>{job.type}</span>
                    <span className="ptag" style={{ background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0" }}>{job.salary}</span>
                    <span className="ptag" style={{ background: `${job.sourceColor}10`, color: job.sourceColor, border: `1px solid ${job.sourceColor}20` }}>{job.source}</span>
                    <span className="ptag" style={{ color: "#94a3b8" }}>{job.posted}</span>
                  </div>
                </div>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke={selectedJob?.id === job.id ? "#6366f1" : "#d1d5db"}
                  strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 3 }}>
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </div>
          ))}

          {searched && !running && displayedJobs.length === 0 && jobs.length > 0 && (
            <div style={{ textAlign: "center", paddingTop: 28, color: "#94a3b8", fontSize: 13 }}>No jobs match the active filters.</div>
          )}
          {searched && !running && jobs.length === 0 && (
            <div style={{ maxWidth: 420, margin: "20px auto", background: "#fff", border: "1px solid #fecaca", borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>No results — source breakdown:</div>
              {SETTINGS_CONFIG.map(cfg => {
                const s   = statuses[cfg.id] || "idle";
                const err = apiErrors[cfg.id];
                const color = s === "success" ? "#16a34a" : s === "cors" || s === "error" || s === "auth" ? "#dc2626" : s === "rate_limit" ? "#d97706" : "#94a3b8";
                return (
                  <div key={cfg.id} style={{ display: "flex", gap: 8, fontSize: 12, marginBottom: 5 }}>
                    <span>{cfg.icon}</span>
                    <span style={{ fontWeight: 500, minWidth: 90 }}>{cfg.name}</span>
                    <span style={{ color }}>{s === "no_key" ? "No key" : err || ST[s]?.label || s}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedJob && (
          <div style={{ flex: 1, overflowY: "auto", padding: "26px 30px", background: "#fff" }}>
            <div className="fade">
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 18 }}>
                <div style={{ width: 50, height: 50, borderRadius: 12, flexShrink: 0,
                  background: selectedJob.logoColor ? `${selectedJob.logoColor}12` : "#eef2ff",
                  border: `1.5px solid ${selectedJob.logoColor ? selectedJob.logoColor + "25" : "#c7d2fe"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 21, fontWeight: 700, color: selectedJob.logoColor || "#4f46e5" }}>
                  {selectedJob.logo || (selectedJob.company || "?")[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.25, marginBottom: 3 }}>{selectedJob.title}</div>
                  <div style={{ fontSize: 13, color: "#64748b" }}>{selectedJob.company}</div>
                </div>
                <a href={selectedJob.applyUrl && selectedJob.applyUrl !== "#" ? selectedJob.applyUrl : undefined} target="_blank" rel="noreferrer">
                  <button className="btn-apply" style={{ padding: "8px 18px", background: selectedJob.sourceColor || "#4f46e5", borderRadius: 99, fontSize: 13, width: "auto", whiteSpace: "nowrap" }}>Apply →</button>
                </a>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 22, paddingBottom: 18, borderBottom: "1px solid #f1f5f9" }}>
                {[
                  { l: selectedJob.location, i: "📍" },
                  { l: selectedJob.salary,   i: "💰" },
                  { l: selectedJob.posted,   i: "🕐" },
                  { l: selectedJob.type,     ac: true },
                  { l: `via ${selectedJob.source}`, src: true },
                ].map((m, i) => (
                  <span key={i} className="ptag" style={{ padding: "5px 12px", fontSize: 12,
                    background: m.ac ? "#eef2ff" : m.src ? `${selectedJob.sourceColor}10` : "#f8fafc",
                    color: m.ac ? "#4f46e5" : m.src ? selectedJob.sourceColor : "#475569",
                    border: `1px solid ${m.ac ? "#c7d2fe" : m.src ? selectedJob.sourceColor + "22" : "#e2e8f0"}` }}>
                    {m.i && <span style={{ marginRight: 4 }}>{m.i}</span>}{m.l}
                  </span>
                ))}
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 9 }}>About the Role</div>
                <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.8 }}>{selectedJob.description || "No description available."}</div>
              </div>

              {selectedJob.requirements?.length > 0 && (
                <div style={{ marginBottom: 26 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 9 }}>Skills & Requirements</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {selectedJob.requirements.map((r, i) => (
                      <span key={i} className="ptag" style={{ background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0", padding: "5px 12px", fontSize: 12, borderRadius: 8 }}>{r}</span>
                    ))}
                  </div>
                </div>
              )}

              <a href={selectedJob.applyUrl && selectedJob.applyUrl !== "#" ? selectedJob.applyUrl : undefined} target="_blank" rel="noreferrer">
                <button className="btn-apply" style={{ padding: "13px 0", background: selectedJob.sourceColor || "#4f46e5", fontSize: 14, borderRadius: 12 }}>
                  Apply on {selectedJob.source} →
                </button>
              </a>
              <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: "#94a3b8" }}>
                {selectedJob.applyUrl && selectedJob.applyUrl !== "#" ? "Opens real job posting" : "Search the company name for the listing"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── SETTINGS PANEL ── */}
      {showSettings && (
        <div className="s-overlay">
          <div className="s-back" onClick={() => setShowSettings(false)} />
          <div className="s-panel">
            <div style={{ padding: "16px 22px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>API Keys</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>Saved in your browser's localStorage</div>
              </div>
              <button onClick={() => setShowSettings(false)} style={{ width: 27, height: 27, borderRadius: 99, background: "#f1f5f9", border: "none", color: "#64748b", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            <div style={{ margin: "12px 18px 0", padding: "10px 13px", borderRadius: 9, background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: 12, color: "#166534", lineHeight: 1.6 }}>
              🔐 <strong>Keys stay private.</strong> Stored in your browser's localStorage only.
            </div>

            <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 9, paddingBottom: 76 }}>
              {SETTINGS_CONFIG.map(cfg => {
                const allFilled = cfg.noKey || cfg.fields.every(f => hasVal(draftKeys[f.key]));
                return (
                  <div key={cfg.id} className={`s-card ${allFilled ? "filled" : ""}`}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: cfg.noKey ? 0 : 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${cfg.color}12`, border: `1px solid ${cfg.color}28`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>
                        {cfg.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>{cfg.name}</span>
                          <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 99, fontWeight: 500, background: allFilled ? "#dcfce7" : "#f1f5f9", color: allFilled ? "#16a34a" : "#94a3b8", border: `1px solid ${allFilled ? "#bbf7d0" : "#e2e8f0"}` }}>
                            {cfg.noKey ? "✓ Free · No key" : allFilled ? "✓ Configured" : "Not set"}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                          {cfg.freeInfo}
                          {cfg.getKeyUrl && <a href={cfg.getKeyUrl} target="_blank" rel="noreferrer" style={{ color: "#4f46e5", marginLeft: 7, fontWeight: 500, fontSize: 11 }}>Get key →</a>}
                        </div>
                      </div>
                    </div>
                    {!cfg.noKey && <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10, lineHeight: 1.55 }}>{cfg.description}</div>}
                    {cfg.fields.map(field => (
                      <div key={field.key} style={{ marginBottom: 7 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>{field.label}</div>
                        <div className="ki-wrap">
                          <input className="ki"
                            type={showFields[field.key] ? "text" : field.type || "password"}
                            value={draftKeys[field.key] || ""}
                            onChange={e => setDraftKeys(p => ({ ...p, [field.key]: e.target.value }))}
                            placeholder={field.placeholder}
                            spellCheck={false} autoComplete="off" />
                          {hasVal(draftKeys[field.key]) && <button className="ki-clr" onClick={() => setDraftKeys(p => ({ ...p, [field.key]: "" }))}>✕</button>}
                          <button className="ki-eye" onClick={() => setShowFields(p => ({ ...p, [field.key]: !p[field.key] }))}>
                            {showFields[field.key] ? "🙈" : "👁"}
                          </button>
                        </div>
                        {hasVal(draftKeys[field.key]) && <div style={{ fontSize: 10, color: "#16a34a", marginTop: 3, fontWeight: 500 }}>✓ Key entered</div>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            <div style={{ position: "sticky", bottom: 0, background: "#fff", borderTop: "1px solid #f1f5f9", padding: "11px 18px", display: "flex", gap: 7 }}>
              <button onClick={saveKeys} style={{ flex: 1, padding: "10px 0", borderRadius: 9, cursor: "pointer", background: savedFlash ? "#16a34a" : "#4f46e5", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, transition: "background .25s" }}>
                {savedFlash ? "✓ Saved!" : "Save & Apply"}
              </button>
              <button onClick={() => setShowSettings(false)} style={{ padding: "10px 16px", borderRadius: 9, background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
