import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LayoutDashboard, Briefcase, Users, CalendarClock, TrendingUp, Settings as SettingsIcon,
  Plus, Search, X, Check, ChevronRight, ChevronLeft, ExternalLink, AlertTriangle, Clock,
  Building2, MapPin, ArrowLeft, Download, Upload, RotateCcw, Menu, CheckCircle2, Circle,
  Trash2, Archive, Linkedin, MessageSquare, UserPlus, Calendar as CalendarIcon, Filter,
  Edit3, MoreHorizontal
} from "lucide-react";

/* ============================== CONSTANTS ============================== */
// Centralized so no status/logic string is duplicated across the app.

const WORK_TYPES = ["On-site", "Hybrid", "Remote", "Not specified"];
const SOURCES = ["LinkedIn", "Naukri", "Indeed", "Infopark", "Technopark", "Company Website", "Referral", "Recruiter", "Other"];
const MANUAL_STATUSES = ["Pending", "Interview Call", "Selected", "Rejected"];
const INTERVIEW_TYPES = ["HR Screening", "Recruiter Call", "Portfolio Review", "Design Interview", "Design Assignment", "Technical / Domain Interview", "Hiring Manager Interview", "Final Interview", "Other"];
const OUTCOMES = ["Scheduled", "Completed", "Waiting", "Next Round", "Selected", "Rejected", "Cancelled", "Rescheduled"];
const CONNECTION_STATUSES = ["Not Contacted", "Request Sent", "Accepted", "Declined", "No Response"];
const REFERRAL_STATUSES = ["Not Asked", "Referral Requested", "Referral Promised", "Referral Submitted", "Referral Received", "Declined", "No Response", "Not Applicable"];
const RESOLVED_REFERRAL_STATUSES = ["Referral Promised", "Referral Submitted", "Referral Received", "Declined", "No Response", "Not Applicable"];

const FOLLOW_UP_DAYS = 3;
const REFERRAL_REMINDER_DAYS = 2;
const CONTACT_TARGET = 3;

const STATUS_TONE = {
  "Pending": "neutral",
  "Follow-up Needed": "warning",
  "Overdue": "negative",
  "Interview Call": "info",
  "Selected": "success",
  "Rejected": "negative",
  "Archived": "neutral",
};

/* ============================== DATE UTILS ============================== */
// Single source of truth for all date math — avoids UTC drift by working
// with plain YYYY-MM-DD strings and noon-anchored Date objects.

function todayISO() {
  const d = new Date();
  return toISO(d);
}
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseISO(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}
function addDays(iso, n) {
  const d = parseISO(iso);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return toISO(d);
}
function daysBetween(fromISO, toISOStr) {
  const a = parseISO(fromISO), b = parseISO(toISOStr);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000);
}
function formatDate(iso, opts = {}) {
  if (!iso) return "—";
  const d = parseISO(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(opts.year ? { year: "numeric" } : {}) });
}
function formatDayLabel(iso) {
  const today = todayISO();
  const diff = daysBetween(today, iso);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return formatDate(iso);
}
function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ============================== BUSINESS LOGIC ============================== */
// All follow-up / referral / status derivation lives here — nowhere else.

function computeFollowUpDue(app) {
  // The single due date for the *next* follow-up action, or null if none pending.
  if (app.dueFollowUpDate !== undefined) return app.dueFollowUpDate;
  return app.followUpDateOverride || addDays(app.appliedDate, FOLLOW_UP_DAYS);
}

function displayStatus(app) {
  if (app.archived) return "Archived";
  if (app.status !== "Pending") return app.status;
  const due = computeFollowUpDue(app);
  if (!due) return "Pending";
  const today = todayISO();
  if (due < today) return "Overdue";
  if (due === today) return "Follow-up Needed";
  return "Pending";
}

function baseFollowUpDate(app) {
  return app.followUpDateOverride || addDays(app.appliedDate, FOLLOW_UP_DAYS);
}

function contactNextAction(c) {
  if (c.connectionStatus === "Not Contacted") return "Send connection request";
  if (c.connectionStatus === "Request Sent") return "Awaiting connection response";
  if (c.connectionStatus === "Declined" || c.connectionStatus === "No Response") return null;
  if (c.connectionStatus === "Accepted" && !c.messageSent) return "Send introductory message";
  if (c.messageSent && c.referralStatus === "Not Asked") return "Consider asking for referral";
  if (c.referralStatus === "Referral Requested") {
    const due = addDays(c.referralRequestedDate, REFERRAL_REMINDER_DAYS);
    if (due && todayISO() >= due) return "Check LinkedIn response";
    return "Referral requested — waiting";
  }
  return null;
}

function referralReminderDue(c) {
  if (c.referralStatus !== "Referral Requested" || !c.referralRequestedDate) return false;
  const due = addDays(c.referralRequestedDate, REFERRAL_REMINDER_DAYS);
  return due !== null && todayISO() >= due;
}

/* ============================== SEED DATA ============================== */

function buildSeedData() {
  const today = todayISO();
  const companies = [
    { id: "c1", name: "ABC Technologies" },
    { id: "c2", name: "XYZ Labs" },
    { id: "c3", name: "DEF Corp" },
    { id: "c4", name: "Northwind Fintech" },
    { id: "c5", name: "Bluepeak Systems" },
  ];
  const applications = [
    { id: "a1", position: "Product Designer", companyId: "c1", location: "Bangalore", workType: "Hybrid", jobUrl: "", source: "LinkedIn", appliedDate: addDays(today, -5), status: "Interview Call", followUpDateOverride: null, dueFollowUpDate: null, lastFollowUpDate: addDays(today, -1), notes: "Referred by Rahul.", archived: false, createdAt: addDays(today, -5), demo: true },
    { id: "a2", position: "UX Designer", companyId: "c2", location: "Kochi", workType: "Remote", jobUrl: "", source: "Naukri", appliedDate: addDays(today, -7), status: "Pending", followUpDateOverride: null, dueFollowUpDate: addDays(today, -2), lastFollowUpDate: null, notes: "", archived: false, createdAt: addDays(today, -7), demo: true },
    { id: "a3", position: "Product Designer", companyId: "c3", location: "Trivandrum", workType: "On-site", jobUrl: "", source: "Referral", appliedDate: addDays(today, -5), status: "Pending", followUpDateOverride: null, dueFollowUpDate: today, lastFollowUpDate: null, notes: "", archived: false, createdAt: addDays(today, -5), demo: true },
    { id: "a4", position: "Senior UI Designer", companyId: "c4", location: "Bangalore", workType: "Hybrid", jobUrl: "", source: "Indeed", appliedDate: addDays(today, -12), status: "Rejected", followUpDateOverride: null, dueFollowUpDate: null, lastFollowUpDate: addDays(today, -8), notes: "Not a fit for level.", archived: false, createdAt: addDays(today, -12), demo: true },
    { id: "a5", position: "Product Designer", companyId: "c5", location: "Remote", workType: "Remote", jobUrl: "", source: "Company Website", appliedDate: addDays(today, -1), status: "Pending", followUpDateOverride: null, dueFollowUpDate: addDays(today, 4), lastFollowUpDate: null, notes: "", archived: false, createdAt: addDays(today, -1), demo: true },
    { id: "a6", position: "Design Systems Designer", companyId: "c1", location: "Bangalore", workType: "Hybrid", jobUrl: "", source: "LinkedIn", appliedDate: addDays(today, -20), status: "Selected", followUpDateOverride: null, dueFollowUpDate: null, lastFollowUpDate: addDays(today, -14), notes: "Offer received.", archived: false, createdAt: addDays(today, -20), demo: true },
  ];
  const interviews = [
    { id: "i1", applicationId: "a1", date: today, time: "10:00", type: "HR Screening", location: "", meetingUrl: "", outcome: "Scheduled", notes: "", demo: true },
    { id: "i2", applicationId: "a1", date: addDays(today, 5), time: "15:00", type: "Portfolio Review", location: "", meetingUrl: "", outcome: "Scheduled", notes: "", demo: true },
    { id: "i3", applicationId: "a6", date: addDays(today, -14), time: "11:00", type: "Final Interview", location: "", meetingUrl: "", outcome: "Selected", notes: "", demo: true },
  ];
  const contacts = [
    { id: "k1", applicationId: "a1", name: "Rahul Sharma", jobTitle: "Product Manager", linkedinUrl: "", connectionStatus: "Accepted", connectionSentDate: addDays(today, -6), connectionAcceptedDate: addDays(today, -5), messageSent: true, messageSentDate: addDays(today, -4), referralStatus: "Referral Requested", referralRequestedDate: addDays(today, -3), lastContactDate: addDays(today, -3), notes: "", demo: true },
    { id: "k2", applicationId: "a2", name: "Neha Thomas", jobTitle: "UX Designer", linkedinUrl: "", connectionStatus: "Accepted", connectionSentDate: addDays(today, -6), connectionAcceptedDate: addDays(today, -5), messageSent: false, messageSentDate: null, referralStatus: "Not Asked", referralRequestedDate: null, lastContactDate: addDays(today, -5), notes: "", demo: true },
    { id: "k3", applicationId: "a3", name: "Arjun Kumar", jobTitle: "Designer", linkedinUrl: "", connectionStatus: "Request Sent", connectionSentDate: addDays(today, -2), connectionAcceptedDate: null, messageSent: false, messageSentDate: null, referralStatus: "Not Applicable", referralRequestedDate: null, lastContactDate: addDays(today, -2), notes: "", demo: true },
    { id: "k4", applicationId: "a5", name: "Priya Nair", jobTitle: "Design Lead", linkedinUrl: "", connectionStatus: "Not Contacted", connectionSentDate: null, connectionAcceptedDate: null, messageSent: false, messageSentDate: null, referralStatus: "Not Applicable", referralRequestedDate: null, lastContactDate: null, notes: "", demo: true },
  ];
  return { companies, applications, interviews, contacts };
}

/* ============================== STORAGE ============================== */

const STORAGE_KEY = "jobhunt-data-v1";

// Standalone build: persists to the browser's localStorage, scoped to
// whatever origin you run this on. Swap this pair of functions for a
// real backend (e.g. a small API + database) when you're ready to sync
// across devices — nothing else in the app needs to change.
async function loadData() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    /* storage unavailable or corrupted — fall through to seed */
  }
  return null;
}
async function saveData(data) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

/* ============================== SMALL UI PRIMITIVES ============================== */

function Badge({ tone = "neutral", children, icon: Icon }) {
  const map = {
    neutral: "bg-slate-100 text-slate-600 border-slate-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    negative: "bg-rose-50 text-rose-700 border-rose-200",
    info: "bg-sky-50 text-sky-700 border-sky-200",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${map[tone] || map.neutral}`}>
      {Icon && <Icon size={12} />}
      {children}
    </span>
  );
}

function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONE[status] || "neutral"}>{status}</Badge>;
}

function EmptyState({ title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {subtitle && <p className="text-sm text-slate-400 mt-1 max-w-xs">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function Card({ children, className = "" }) {
  return <div className={`bg-white border border-slate-200 rounded-xl ${className}`}>{children}</div>;
}

function IconButton({ onClick, children, title, className = "" }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 h-8 w-8 transition ${className}`}
    >
      {children}
    </button>
  );
}

function PrimaryButton({ onClick, children, className = "", type = "button" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1E2A4A] text-white text-sm font-medium hover:bg-[#16203a] transition ${className}`}
    >
      {children}
    </button>
  );
}

function GhostButton({ onClick, children, className = "" }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition ${className}`}
    >
      {children}
    </button>
  );
}

function Field({ label, required, children, hint }) {
  return (
    <label className="block mb-4">
      <span className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1E2A4A]/20 focus:border-[#1E2A4A] transition placeholder:text-slate-350";

function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4 overflow-y-auto">
      <div className={`bg-white w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} sm:rounded-2xl rounded-none min-h-screen sm:min-h-0 shadow-xl`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white sm:rounded-t-2xl z-10">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* ============================== NAVIGATION ============================== */

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "applications", label: "Applications", icon: Briefcase },
  { id: "followups", label: "Follow-ups", icon: CalendarClock },
  { id: "interviews", label: "Interviews", icon: CalendarIcon },
  { id: "linkedin", label: "LinkedIn Outreach", icon: Linkedin },
  { id: "analytics", label: "Analytics", icon: TrendingUp },
];

function Sidebar({ active, onNav, counts }) {
  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-slate-200 bg-white h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-slate-100">
        <p className="font-bold text-slate-800 text-[15px] leading-tight">Job Hunt</p>
        <p className="text-xs text-slate-400 font-medium">Command Center</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          const badge = counts[item.id];
          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                isActive ? "bg-[#1E2A4A] text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon size={17} />
              <span className="flex-1 text-left">{item.label}</span>
              {!!badge && (
                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${isActive ? "bg-white/20 text-white" : "bg-rose-100 text-rose-600"}`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="px-3 py-4 border-t border-slate-100">
        <button
          onClick={() => onNav("settings")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
            active === "settings" ? "bg-[#1E2A4A] text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <SettingsIcon size={17} />
          Settings
        </button>
      </div>
    </aside>
  );
}

function MobileTopBar({ onMenu, title }) {
  return (
    <div className="md:hidden sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
      <p className="font-bold text-slate-800">{title}</p>
      <button onClick={onMenu} className="text-slate-500"><Menu size={22} /></button>
    </div>
  );
}

function MobileNav({ active, onNav }) {
  const items = [
    { id: "dashboard", label: "Today", icon: LayoutDashboard },
    { id: "followups", label: "Follow-ups", icon: CalendarClock },
    { id: "interviews", label: "Interviews", icon: CalendarIcon },
    { id: "applications", label: "Applications", icon: Briefcase },
  ];
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 flex">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button key={item.id} onClick={() => onNav(item.id)} className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${isActive ? "text-[#1E2A4A]" : "text-slate-400"}`}>
            <Icon size={19} />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/* ============================== APP ============================== */

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [applications, setApplications] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [isDemo, setIsDemo] = useState(false);

  const [view, setView] = useState("dashboard");
  const [selectedAppId, setSelectedAppId] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showAddApp, setShowAddApp] = useState(false);
  const [toast, setToast] = useState(null);

  /* ---------- load ---------- */
  useEffect(() => {
    (async () => {
      const data = await loadData();
      if (data && data.applications && data.applications.length > 0) {
        setCompanies(data.companies || []);
        setApplications(data.applications || []);
        setInterviews(data.interviews || []);
        setContacts(data.contacts || []);
        setIsDemo(!!(data.applications || []).some((a) => a.demo));
      } else {
        const seed = buildSeedData();
        setCompanies(seed.companies);
        setApplications(seed.applications);
        setInterviews(seed.interviews);
        setContacts(seed.contacts);
        setIsDemo(true);
      }
      setLoaded(true);
    })();
  }, []);

  /* ---------- persist (debounced) ---------- */
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      saveData({ companies, applications, interviews, contacts });
    }, 400);
    return () => clearTimeout(t);
  }, [companies, applications, interviews, contacts, loaded]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  /* ---------- derived lookups ---------- */
  const companyName = useCallback((id) => companies.find((c) => c.id === id)?.name || "Unknown Company", [companies]);
  const activeApps = useMemo(() => applications.filter((a) => !a.archived), [applications]);
  const appById = useCallback((id) => applications.find((a) => a.id === id), [applications]);
  const interviewsFor = useCallback((appId) => interviews.filter((i) => i.applicationId === appId), [interviews]);
  const contactsFor = useCallback((appId) => contacts.filter((c) => c.applicationId === appId), [contacts]);

  const today = todayISO();

  const stats = useMemo(() => {
    const s = { total: activeApps.length, pending: 0, followup: 0, interview: 0, selected: 0, rejected: 0 };
    activeApps.forEach((a) => {
      const ds = displayStatus(a);
      if (ds === "Pending") s.pending++;
      else if (ds === "Follow-up Needed" || ds === "Overdue") s.followup++;
      else if (ds === "Interview Call") s.interview++;
      else if (ds === "Selected") s.selected++;
      else if (ds === "Rejected") s.rejected++;
    });
    return s;
  }, [activeApps]);

  const interviewsToday = useMemo(() => interviews.filter((i) => i.date === today && !appById(i.applicationId)?.archived), [interviews, today, appById]);
  const followUpsDueToday = useMemo(() => activeApps.filter((a) => displayStatus(a) === "Follow-up Needed"), [activeApps]);
  const followUpsOverdue = useMemo(() => activeApps.filter((a) => displayStatus(a) === "Overdue"), [activeApps]);
  const referralRemindersDue = useMemo(() => contacts.filter((c) => referralReminderDue(c) && !appById(c.applicationId)?.archived), [contacts, appById]);
  const linkedinSuggested = useMemo(
    () => contacts.filter((c) => {
      const app = appById(c.applicationId);
      if (!app || app.archived) return false;
      const action = contactNextAction(c);
      return action && action !== "Awaiting connection response" && !referralReminderDue(c);
    }),
    [contacts, appById]
  );

  const upcoming7Days = useMemo(() => {
    const days = {};
    for (let i = 1; i <= 7; i++) {
      const d = addDays(today, i);
      const dueApps = activeApps.filter((a) => computeFollowUpDue(a) === d && a.status === "Pending");
      const dueInterviews = interviews.filter((iv) => iv.date === d && !appById(iv.applicationId)?.archived);
      if (dueApps.length || dueInterviews.length) days[d] = { apps: dueApps, interviews: dueInterviews };
    }
    return days;
  }, [activeApps, interviews, today, appById]);

  const navCounts = {
    dashboard: interviewsToday.length + followUpsDueToday.length + followUpsOverdue.length + referralRemindersDue.length,
    followups: followUpsDueToday.length + followUpsOverdue.length,
    interviews: interviewsToday.length,
    linkedin: referralRemindersDue.length,
  };

  /* ---------- mutation helpers ---------- */
  function clearDemoFlagIfNeeded(list) {
    return list;
  }

  function addApplication(form) {
    let companyId = form.companyId;
    if (!companyId && form.companyName) {
      const existing = companies.find((c) => c.name.toLowerCase() === form.companyName.trim().toLowerCase());
      if (existing) companyId = existing.id;
      else {
        const nc = { id: uid("c"), name: form.companyName.trim() };
        setCompanies((prev) => [...prev, nc]);
        companyId = nc.id;
      }
    }
    const newApp = {
      id: uid("a"),
      position: form.position.trim(),
      companyId,
      location: form.location || "",
      workType: form.workType || "Not specified",
      jobUrl: form.jobUrl || "",
      source: form.source || "Other",
      appliedDate: form.appliedDate || today,
      status: "Pending",
      followUpDateOverride: form.followUpDateOverride || null,
      dueFollowUpDate: form.followUpDateOverride || addDays(form.appliedDate || today, FOLLOW_UP_DAYS),
      lastFollowUpDate: null,
      notes: form.notes || "",
      archived: false,
      createdAt: todayISO(),
      demo: false,
    };
    setApplications((prev) => [newApp, ...prev]);
    showToast("Application added");
    return newApp.id;
  }

  function updateApplication(id, patch) {
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch, demo: false } : a)));
  }

  function markFollowedUp(id) {
    updateApplication(id, { lastFollowUpDate: today, dueFollowUpDate: null });
    showToast("Marked as followed up");
  }

  function scheduleNextFollowUp(id, date) {
    updateApplication(id, { dueFollowUpDate: date });
    showToast("Next follow-up scheduled");
  }

  function archiveApplication(id) {
    updateApplication(id, { archived: true });
    showToast("Application archived");
  }

  function unarchiveApplication(id) {
    updateApplication(id, { archived: false });
  }

  function deleteApplication(id) {
    setApplications((prev) => prev.filter((a) => a.id !== id));
    setInterviews((prev) => prev.filter((i) => i.applicationId !== id));
    setContacts((prev) => prev.filter((c) => c.applicationId !== id));
    if (selectedAppId === id) { setSelectedAppId(null); setView("applications"); }
    showToast("Application deleted");
  }

  function addInterview(appId, form) {
    const iv = { id: uid("i"), applicationId: appId, date: form.date, time: form.time || "", type: form.type || "Other", location: form.location || "", meetingUrl: form.meetingUrl || "", outcome: form.outcome || "Scheduled", notes: form.notes || "", demo: false };
    setInterviews((prev) => [iv, ...prev]);
    // An interview scheduled implies the applicant is past the initial follow-up window.
    const app = appById(appId);
    if (app && app.status === "Pending") updateApplication(appId, { status: "Interview Call", dueFollowUpDate: null });
    showToast("Interview added");
  }
  function updateInterview(id, patch) {
    setInterviews((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch, demo: false } : i)));
  }
  function deleteInterview(id) {
    setInterviews((prev) => prev.filter((i) => i.id !== id));
  }

  function addContact(appId, form) {
    const c = {
      id: uid("k"), applicationId: appId, name: form.name.trim(), jobTitle: form.jobTitle || "",
      linkedinUrl: form.linkedinUrl || "", connectionStatus: form.connectionStatus || "Not Contacted",
      connectionSentDate: form.connectionStatus === "Request Sent" ? today : null,
      connectionAcceptedDate: null, messageSent: false, messageSentDate: null,
      referralStatus: "Not Asked", referralRequestedDate: null, lastContactDate: today, notes: form.notes || "", demo: false,
    };
    setContacts((prev) => [c, ...prev]);
    showToast("Contact added");
  }
  function updateContact(id, patch) {
    setContacts((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      const next = { ...c, ...patch, demo: false };
      if (patch.connectionStatus === "Request Sent" && !c.connectionSentDate) next.connectionSentDate = today;
      if (patch.connectionStatus === "Accepted" && !c.connectionAcceptedDate) next.connectionAcceptedDate = today;
      if (patch.messageSent === true && !c.messageSentDate) next.messageSentDate = today;
      if (patch.referralStatus === "Referral Requested" && !c.referralRequestedDate) next.referralRequestedDate = today;
      next.lastContactDate = today;
      return next;
    }));
  }
  function deleteContact(id) {
    setContacts((prev) => prev.filter((c) => c.id !== id));
  }

  async function resetDemoData() {
    const seed = buildSeedData();
    setCompanies(seed.companies);
    setApplications(seed.applications);
    setInterviews(seed.interviews);
    setContacts(seed.contacts);
    setIsDemo(true);
    showToast("Demo data restored");
  }

  async function clearAllData() {
    setCompanies([]); setApplications([]); setInterviews([]); setContacts([]);
    setIsDemo(false);
    showToast("All data cleared");
  }

  function exportData() {
    const payload = { companies, applications, interviews, contacts, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `job-hunt-export-${today}.json`; a.click();
    URL.revokeObjectURL(url);
    showToast("Data exported");
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        setCompanies(data.companies || []);
        setApplications(data.applications || []);
        setInterviews(data.interviews || []);
        setContacts(data.contacts || []);
        setIsDemo(false);
        showToast("Data imported");
      } catch (err) {
        showToast("Import failed — invalid file");
      }
    };
    reader.readAsText(file);
  }

  function openApp(id) {
    setSelectedAppId(id);
    setView("appdetails");
    setMobileMenuOpen(false);
  }

  if (!loaded) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Loading your job search…</div>;
  }

  const viewTitle = NAV_ITEMS.find((n) => n.id === view)?.label || (view === "settings" ? "Settings" : "Job Hunt");

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-slate-800 font-sans flex">
      <style>{`
        .font-sans { font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      `}</style>

      <Sidebar active={view} onNav={(v) => { setView(v); setSelectedAppId(null); }} counts={navCounts} />

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <p className="font-bold text-slate-800">Job Hunt</p>
              <button onClick={() => setMobileMenuOpen(false)}><X size={20} className="text-slate-500" /></button>
            </div>
            <nav className="space-y-1">
              {[...NAV_ITEMS, { id: "settings", label: "Settings", icon: SettingsIcon }].map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.id} onClick={() => { setView(item.id); setSelectedAppId(null); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium ${view === item.id ? "bg-[#1E2A4A] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                    <Icon size={17} />{item.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      <main className="flex-1 min-w-0 pb-16 md:pb-0">
        <MobileTopBar onMenu={() => setMobileMenuOpen(true)} title={view === "appdetails" ? "Application" : viewTitle} />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          {isDemo && (
            <div className="mb-4 flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2">
              <span>You're viewing sample demo data so you can try the app.</span>
              <button onClick={clearAllData} className="font-semibold underline shrink-0">Start fresh</button>
            </div>
          )}

          {view === "dashboard" && (
            <Dashboard
              stats={stats}
              interviewsToday={interviewsToday}
              followUpsDueToday={followUpsDueToday}
              followUpsOverdue={followUpsOverdue}
              referralRemindersDue={referralRemindersDue}
              linkedinSuggested={linkedinSuggested}
              upcoming7Days={upcoming7Days}
              companyName={companyName}
              openApp={openApp}
              markFollowedUp={markFollowedUp}
              onAddApp={() => setShowAddApp(true)}
              today={today}
            />
          )}

          {view === "applications" && (
            <ApplicationsView
              applications={applications}
              companyName={companyName}
              openApp={openApp}
              onAddApp={() => setShowAddApp(true)}
            />
          )}

          {view === "followups" && (
            <FollowUpsView
              applications={activeApps}
              companyName={companyName}
              openApp={openApp}
              markFollowedUp={markFollowedUp}
              scheduleNextFollowUp={scheduleNextFollowUp}
            />
          )}

          {view === "interviews" && (
            <InterviewsView
              interviews={interviews}
              applications={applications}
              companyName={companyName}
              openApp={openApp}
              updateInterview={updateInterview}
            />
          )}

          {view === "linkedin" && (
            <LinkedInView
              contacts={contacts}
              applications={activeApps}
              companyName={companyName}
              openApp={openApp}
              updateContact={updateContact}
            />
          )}

          {view === "analytics" && (
            <AnalyticsView applications={activeApps} contacts={contacts} interviews={interviews} />
          )}

          {view === "settings" && (
            <SettingsView
              onExport={exportData}
              onImport={importData}
              onResetDemo={resetDemoData}
              onClearAll={clearAllData}
              counts={{ applications: applications.length, contacts: contacts.length, interviews: interviews.length }}
            />
          )}

          {view === "appdetails" && selectedAppId && appById(selectedAppId) && (
            <ApplicationDetails
              app={appById(selectedAppId)}
              companyName={companyName}
              interviews={interviewsFor(selectedAppId)}
              contacts={contactsFor(selectedAppId)}
              onBack={() => setView("applications")}
              updateApplication={updateApplication}
              markFollowedUp={markFollowedUp}
              scheduleNextFollowUp={scheduleNextFollowUp}
              archiveApplication={archiveApplication}
              unarchiveApplication={unarchiveApplication}
              deleteApplication={deleteApplication}
              addInterview={addInterview}
              updateInterview={updateInterview}
              deleteInterview={deleteInterview}
              addContact={addContact}
              updateContact={updateContact}
              deleteContact={deleteContact}
            />
          )}
        </div>
      </main>

      <MobileNav active={view} onNav={(v) => { setView(v); setSelectedAppId(null); }} />

      {showAddApp && (
        <AddApplicationModal
          companies={companies}
          onClose={() => setShowAddApp(false)}
          onSubmit={(form) => { const id = addApplication(form); setShowAddApp(false); openApp(id); }}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-sm px-4 py-2 rounded-full shadow-lg z-50 flex items-center gap-2">
          <Check size={14} /> {toast}
        </div>
      )}

      {/* Floating add button */}
      <button
        onClick={() => setShowAddApp(true)}
        className="hidden md:flex fixed bottom-6 right-6 items-center gap-2 px-4 py-3 rounded-full bg-[#1E2A4A] text-white shadow-lg hover:bg-[#16203a] transition font-medium text-sm z-30"
      >
        <Plus size={18} /> Add Application
      </button>
      <button
        onClick={() => setShowAddApp(true)}
        className="md:hidden fixed bottom-20 right-4 h-12 w-12 flex items-center justify-center rounded-full bg-[#1E2A4A] text-white shadow-lg z-30"
      >
        <Plus size={22} />
      </button>
    </div>
  );
}

/* ============================== DASHBOARD ============================== */

function SummaryCard({ value, label, tone }) {
  const toneCls = {
    neutral: "text-slate-800", warning: "text-amber-600", info: "text-sky-600", success: "text-emerald-600", negative: "text-rose-600",
  }[tone] || "text-slate-800";
  return (
    <Card className="px-4 py-3.5 flex-1 min-w-[104px]">
      <p className={`text-2xl font-bold ${toneCls}`}>{value}</p>
      <p className="text-xs text-slate-500 font-medium mt-0.5">{label}</p>
    </Card>
  );
}

function Dashboard({ stats, interviewsToday, followUpsDueToday, followUpsOverdue, referralRemindersDue, linkedinSuggested, upcoming7Days, companyName, openApp, markFollowedUp, onAddApp, today }) {
  const hasAnyToday = interviewsToday.length || followUpsDueToday.length || followUpsOverdue.length || referralRemindersDue.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Good to see you 👋</h1>
        <p className="text-sm text-slate-500 mt-0.5">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} — here's what needs attention.</p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        <SummaryCard value={stats.total} label="Total Applied" />
        <SummaryCard value={stats.pending} label="Pending" />
        <SummaryCard value={stats.followup} label="Follow-up Needed" tone="warning" />
        <SummaryCard value={stats.interview} label="Interview Call" tone="info" />
        <SummaryCard value={stats.selected} label="Selected" tone="success" />
        <SummaryCard value={stats.rejected} label="Rejected" tone="negative" />
      </div>

      <section>
        <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-1.5"><Clock size={15} /> Today's Actions</h2>

        {!hasAnyToday && (
          <Card className="py-8">
            <EmptyState title="Nothing urgent today" subtitle="Your schedule is clear. Nice work staying on top of things." />
          </Card>
        )}

        <div className="space-y-4">
          {interviewsToday.length > 0 && (
            <Card className="p-4">
              <p className="text-xs font-bold text-sky-700 uppercase tracking-wide mb-2.5">Today's Interviews</p>
              <div className="space-y-2.5">
                {interviewsToday.map((iv) => {
                  const app = null;
                  return (
                    <InterviewTodayRow key={iv.id} iv={iv} companyName={companyName} openApp={openApp} />
                  );
                })}
              </div>
            </Card>
          )}

          {followUpsOverdue.length > 0 && (
            <Card className="p-4">
              <p className="text-xs font-bold text-rose-700 uppercase tracking-wide mb-2.5">Overdue Follow-ups</p>
              <div className="space-y-2.5">
                {followUpsOverdue.map((a) => (
                  <FollowUpActionRow key={a.id} app={a} companyName={companyName} openApp={openApp} markFollowedUp={markFollowedUp} overdue today={today} />
                ))}
              </div>
            </Card>
          )}

          {followUpsDueToday.length > 0 && (
            <Card className="p-4">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2.5">Follow-ups Due Today</p>
              <div className="space-y-2.5">
                {followUpsDueToday.map((a) => (
                  <FollowUpActionRow key={a.id} app={a} companyName={companyName} openApp={openApp} markFollowedUp={markFollowedUp} today={today} />
                ))}
              </div>
            </Card>
          )}

          {referralRemindersDue.length > 0 && (
            <Card className="p-4">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2.5">LinkedIn — Referral Follow-up</p>
              <div className="space-y-2.5">
                {referralRemindersDue.map((c) => (
                  <ReferralReminderRow key={c.id} contact={c} companyName={companyName} openApp={openApp} />
                ))}
              </div>
            </Card>
          )}

          {linkedinSuggested.length > 0 && (
            <Card className="p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2.5">LinkedIn Actions</p>
              <div className="space-y-2.5">
                {linkedinSuggested.slice(0, 5).map((c) => (
                  <LinkedInSuggestedRow key={c.id} contact={c} companyName={companyName} openApp={openApp} />
                ))}
              </div>
            </Card>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-1.5"><CalendarClock size={15} /> Upcoming</h2>
        {Object.keys(upcoming7Days).length === 0 ? (
          <Card className="py-6"><EmptyState title="Nothing on the horizon yet" subtitle="Follow-ups and interviews in the next 7 days will show up here." /></Card>
        ) : (
          <Card className="p-4 divide-y divide-slate-100">
            {Object.entries(upcoming7Days).sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, { apps, interviews: ivs }]) => (
              <div key={date} className="py-2.5 first:pt-0 last:pb-0 flex items-start gap-4">
                <p className="w-20 shrink-0 text-xs font-semibold text-slate-500 pt-0.5">{formatDayLabel(date)}</p>
                <div className="flex-1 space-y-1">
                  {apps.map((a) => (
                    <button key={a.id} onClick={() => openApp(a.id)} className="block text-sm text-slate-700 hover:text-[#1E2A4A] hover:underline text-left">
                      Follow up — {a.position} · {companyName(a.companyId)}
                    </button>
                  ))}
                  {ivs.map((iv) => (
                    <button key={iv.id} onClick={() => openApp(iv.applicationId)} className="block text-sm text-slate-700 hover:text-[#1E2A4A] hover:underline text-left">
                      Interview — {iv.type} {iv.time && `at ${iv.time}`}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function InterviewTodayRow({ iv, companyName, openApp }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-sky-50/60 rounded-lg px-3 py-2.5">
      <div>
        <p className="text-sm font-semibold text-slate-800">{iv.time ? formatTime(iv.time) : "Time TBD"} — {iv.type}</p>
        <p className="text-xs text-slate-500 mt-0.5">Application · <button onClick={() => openApp(iv.applicationId)} className="underline hover:text-[#1E2A4A]">view details</button></p>
      </div>
      <GhostButton onClick={() => openApp(iv.applicationId)}>View <ChevronRight size={14} /></GhostButton>
    </div>
  );
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function FollowUpActionRow({ app, companyName, openApp, markFollowedUp, overdue, today }) {
  const due = computeFollowUpDue(app);
  const days = Math.abs(daysBetween(due, today));
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 ${overdue ? "bg-rose-50/60" : "bg-amber-50/60"}`}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{app.position} · {companyName(app.companyId)}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {overdue ? `Follow-up was due ${formatDate(due)} — ${days} day${days === 1 ? "" : "s"} overdue` : "Follow-up due today"}
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <GhostButton onClick={() => openApp(app.id)}>Open</GhostButton>
        <PrimaryButton onClick={() => markFollowedUp(app.id)} className="!px-3 !py-1.5">Mark Followed Up</PrimaryButton>
      </div>
    </div>
  );
}

function ReferralReminderRow({ contact, companyName, openApp }) {
  const app = null;
  const days = contact.referralRequestedDate ? daysBetween(contact.referralRequestedDate, todayISO()) : 0;
  return (
    <div className="flex items-center justify-between gap-3 bg-amber-50/60 rounded-lg px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{contact.name}</p>
        <p className="text-xs text-slate-500 mt-0.5">Referral requested {days} day{days === 1 ? "" : "s"} ago · No status update recorded</p>
      </div>
      <GhostButton onClick={() => openApp(contact.applicationId)}>Check Message <ChevronRight size={14} /></GhostButton>
    </div>
  );
}

function LinkedInSuggestedRow({ contact, companyName, openApp }) {
  const action = contactNextAction(contact);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 bg-slate-50">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{contact.name}</p>
        <p className="text-xs text-slate-500 mt-0.5">Next: {action}</p>
      </div>
      <GhostButton onClick={() => openApp(contact.applicationId)}>Open <ChevronRight size={14} /></GhostButton>
    </div>
  );
}

/* ============================== APPLICATIONS LIST ============================== */

function ApplicationsView({ applications, companyName, openApp, onAddApp }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("Newest");
  const [showArchived, setShowArchived] = useState(false);

  const filtered = useMemo(() => {
    let list = applications.filter((a) => (showArchived ? true : !a.archived));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a) => a.position.toLowerCase().includes(q) || companyName(a.companyId).toLowerCase().includes(q) || (a.notes || "").toLowerCase().includes(q));
    }
    if (statusFilter !== "All") list = list.filter((a) => displayStatus(a) === statusFilter);
    list = [...list].sort((a, b) => {
      if (sortBy === "Newest") return b.appliedDate.localeCompare(a.appliedDate);
      if (sortBy === "Oldest") return a.appliedDate.localeCompare(b.appliedDate);
      if (sortBy === "Follow-up date") return (computeFollowUpDue(a) || "9999").localeCompare(computeFollowUpDue(b) || "9999");
      if (sortBy === "Company") return companyName(a.companyId).localeCompare(companyName(b.companyId));
      return 0;
    });
    return list;
  }, [applications, search, statusFilter, sortBy, showArchived, companyName]);

  const statusOptions = ["All", "Pending", "Follow-up Needed", "Overdue", "Interview Call", "Selected", "Rejected"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">Applications</h1>
        <GhostButton onClick={onAddApp} className="hidden sm:inline-flex"><Plus size={15} /> Add</GhostButton>
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-350" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search position, company, notes…" className={`${inputCls} pl-9`} />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputCls} sm:w-44`}>
          {statusOptions.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={`${inputCls} sm:w-40`}>
          {["Newest", "Oldest", "Follow-up date", "Company"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      <button onClick={() => setShowArchived((v) => !v)} className="text-xs text-slate-400 hover:text-slate-600 font-medium">
        {showArchived ? "Hide archived" : "Show archived"}
      </button>

      {filtered.length === 0 ? (
        <Card className="py-10">
          <EmptyState title="No applications yet" subtitle="Add your first application to start tracking your job search." action={<PrimaryButton onClick={onAddApp}><Plus size={15} /> Add Application</PrimaryButton>} />
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => <ApplicationRow key={a.id} app={a} companyName={companyName} onClick={() => openApp(a.id)} />)}
        </div>
      )}
    </div>
  );
}

function ApplicationRow({ app, companyName, onClick }) {
  const ds = displayStatus(app);
  const due = computeFollowUpDue(app);
  return (
    <button onClick={onClick} className="w-full text-left">
      <Card className="p-3.5 hover:border-slate-300 transition flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
          <Building2 size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{app.position}</p>
          <p className="text-xs text-slate-500 truncate">{companyName(app.companyId)}{app.location ? ` · ${app.location}` : ""}</p>
        </div>
        <div className="text-right shrink-0 hidden sm:block">
          <p className="text-xs text-slate-400">Applied {formatDate(app.appliedDate)}</p>
          {app.status === "Pending" && due && <p className="text-xs text-slate-400">Follow-up {formatDate(due)}</p>}
        </div>
        <StatusBadge status={ds} />
        <ChevronRight size={16} className="text-slate-300 shrink-0" />
      </Card>
    </button>
  );
}

/* ============================== ADD APPLICATION MODAL ============================== */

function AddApplicationModal({ companies, onClose, onSubmit }) {
  const [mode, setMode] = useState("quick"); // quick | full
  const [form, setForm] = useState({
    position: "", companyName: "", companyId: "", location: "", workType: "Not specified",
    jobUrl: "", source: "LinkedIn", appliedDate: todayISO(), followUpOverrideEnabled: false, followUpDateOverride: "", notes: "",
  });
  const [error, setError] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const computedFollowUp = form.followUpOverrideEnabled && form.followUpDateOverride ? form.followUpDateOverride : addDays(form.appliedDate || todayISO(), FOLLOW_UP_DAYS);

  function submit() {
    if (!form.position.trim() || !form.companyName.trim() || !form.appliedDate) {
      setError("Position, company, and applied date are required.");
      return;
    }
    onSubmit({
      position: form.position, companyName: form.companyName, location: form.location, workType: form.workType,
      jobUrl: form.jobUrl, source: form.source, appliedDate: form.appliedDate,
      followUpDateOverride: form.followUpOverrideEnabled ? form.followUpDateOverride : null, notes: form.notes,
    });
  }

  return (
    <Modal title="Add Application" onClose={onClose} wide={mode === "full"}
      footer={<>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton onClick={submit}>Save Application</PrimaryButton>
      </>}>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setMode("quick")} className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${mode === "quick" ? "bg-[#1E2A4A] text-white border-[#1E2A4A]" : "border-slate-200 text-slate-500"}`}>Quick Add</button>
        <button onClick={() => setMode("full")} className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${mode === "full" ? "bg-[#1E2A4A] text-white border-[#1E2A4A]" : "border-slate-200 text-slate-500"}`}>Full Details</button>
      </div>

      {error && <div className="mb-3 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

      <Field label="Position" required>
        <input className={inputCls} value={form.position} onChange={(e) => set("position", e.target.value)} placeholder="Product Designer" />
      </Field>
      <Field label="Company" required hint="Type a new company name or match an existing one.">
        <input list="company-list" className={inputCls} value={form.companyName} onChange={(e) => set("companyName", e.target.value)} placeholder="ABC Technologies" />
        <datalist id="company-list">{companies.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Applied On" required>
          <input type="date" className={inputCls} value={form.appliedDate} onChange={(e) => set("appliedDate", e.target.value)} />
        </Field>
        <Field label="Source">
          <select className={inputCls} value={form.source} onChange={(e) => set("source", e.target.value)}>
            {SOURCES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 mb-4">
        <p className="text-xs text-slate-500">Follow-up Date</p>
        <p className="text-sm font-semibold text-slate-800">{formatDate(computedFollowUp, { year: true })}</p>
        <label className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500">
          <input type="checkbox" checked={form.followUpOverrideEnabled} onChange={(e) => set("followUpOverrideEnabled", e.target.checked)} />
          Customize this date
        </label>
        {form.followUpOverrideEnabled && (
          <input type="date" className={`${inputCls} mt-2`} value={form.followUpDateOverride} onChange={(e) => set("followUpDateOverride", e.target.value)} />
        )}
        {!form.followUpOverrideEnabled && <p className="text-xs text-slate-400 mt-1">Automatically calculated: {FOLLOW_UP_DAYS} days after application</p>}
      </div>

      {mode === "full" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Location">
              <input className={inputCls} value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Bangalore" />
            </Field>
            <Field label="Work Type">
              <select className={inputCls} value={form.workType} onChange={(e) => set("workType", e.target.value)}>
                {WORK_TYPES.map((w) => <option key={w}>{w}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Job URL">
            <input className={inputCls} value={form.jobUrl} onChange={(e) => set("jobUrl", e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Notes">
            <textarea rows={3} className={inputCls} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything worth remembering about this application…" />
          </Field>
        </>
      )}
      {mode === "quick" && <p className="text-xs text-slate-400">You can add location, job URL, and notes anytime from the application page.</p>}
    </Modal>
  );
}

/* ============================== APPLICATION DETAILS ============================== */

function ApplicationDetails({ app, companyName, interviews, contacts, onBack, updateApplication, markFollowedUp, scheduleNextFollowUp, archiveApplication, unarchiveApplication, deleteApplication, addInterview, updateInterview, deleteInterview, addContact, updateContact, deleteContact }) {
  const [tab, setTab] = useState("overview");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(app.notes || "");
  const [showAddInterview, setShowAddInterview] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showScheduleNext, setShowScheduleNext] = useState(false);
  const [nextDate, setNextDate] = useState(addDays(todayISO(), FOLLOW_UP_DAYS));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const ds = displayStatus(app);
  const due = computeFollowUpDue(app);
  const contactedCount = contacts.filter((c) => c.connectionStatus !== "Not Contacted").length;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 font-medium">
        <ArrowLeft size={16} /> Back to Applications
      </button>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{companyName(app.companyId)}</p>
            <h1 className="text-lg font-bold text-slate-800 mt-0.5">{app.position}</h1>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={ds} />
            <select value={app.status} onChange={(e) => updateApplication(app.id, { status: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600">
              {MANUAL_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-100">
          <div>
            <p className="text-xs text-slate-400">Applied</p>
            <p className="text-sm font-medium text-slate-700">{formatDate(app.appliedDate, { year: true })}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Source</p>
            <p className="text-sm font-medium text-slate-700">{app.source}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Location</p>
            <p className="text-sm font-medium text-slate-700">{app.location || "—"} <span className="text-slate-400">({app.workType})</span></p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Job URL</p>
            {app.jobUrl ? <a href={app.jobUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-[#1E2A4A] hover:underline inline-flex items-center gap-1">View Job <ExternalLink size={12} /></a> : <p className="text-sm text-slate-400">—</p>}
          </div>
        </div>

        {app.status === "Pending" && (
          <div className={`mt-4 rounded-lg px-3.5 py-3 flex items-center justify-between flex-wrap gap-2 ${ds === "Overdue" ? "bg-rose-50" : ds === "Follow-up Needed" ? "bg-amber-50" : "bg-slate-50"}`}>
            <div>
              <p className="text-xs text-slate-500">{due ? "Next follow-up" : "No follow-up scheduled"}</p>
              <p className="text-sm font-semibold text-slate-800">{due ? formatDate(due, { year: true }) : "—"}</p>
            </div>
            <div className="flex gap-2">
              {due && <PrimaryButton onClick={() => markFollowedUp(app.id)}>Mark Followed Up</PrimaryButton>}
              <GhostButton onClick={() => setShowScheduleNext(true)}>Schedule Next</GhostButton>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
          {app.archived ? (
            <GhostButton onClick={() => unarchiveApplication(app.id)}><Archive size={14} /> Unarchive</GhostButton>
          ) : (
            <GhostButton onClick={() => archiveApplication(app.id)}><Archive size={14} /> Archive</GhostButton>
          )}
          {!confirmDelete ? (
            <GhostButton onClick={() => setConfirmDelete(true)} className="!text-rose-600"><Trash2 size={14} /> Delete</GhostButton>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Delete permanently?</span>
              <button onClick={() => deleteApplication(app.id)} className="text-rose-600 font-semibold">Yes, delete</button>
              <button onClick={() => setConfirmDelete(false)} className="text-slate-400">Cancel</button>
            </div>
          )}
        </div>
      </Card>

      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {["overview", "interviews", "linkedin", "notes"].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm font-medium capitalize border-b-2 -mb-px whitespace-nowrap ${tab === t ? "border-[#1E2A4A] text-[#1E2A4A]" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
            {t === "linkedin" ? `LinkedIn (${contactedCount}/${CONTACT_TARGET})` : t === "interviews" ? `Interviews (${interviews.length})` : t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <Card className="p-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">Interview Timeline</p>
          {interviews.length === 0 ? (
            <p className="text-sm text-slate-400">No interviews scheduled yet.</p>
          ) : (
            <div className="space-y-2">
              {[...interviews].sort((a, b) => a.date.localeCompare(b.date)).map((iv) => (
                <div key={iv.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                  <span className="text-slate-700">{formatDate(iv.date)} — {iv.type}</span>
                  <Badge tone={iv.outcome === "Selected" ? "success" : iv.outcome === "Rejected" || iv.outcome === "Cancelled" ? "negative" : "info"}>{iv.outcome}</Badge>
                </div>
              ))}
            </div>
          )}
          <p className="text-sm font-semibold text-slate-700 mt-5 mb-3">LinkedIn Outreach</p>
          {contacts.length === 0 ? (
            <p className="text-sm text-slate-400">No contacts added yet.</p>
          ) : (
            <div className="space-y-2">
              {contacts.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                  <span className="text-slate-700">{c.name}<span className="text-slate-400"> · {c.jobTitle}</span></span>
                  <Badge tone={c.connectionStatus === "Accepted" ? "success" : "neutral"}>{c.connectionStatus}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "interviews" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <GhostButton onClick={() => setShowAddInterview(true)}><Plus size={14} /> Add Interview</GhostButton>
          </div>
          {interviews.length === 0 ? (
            <Card className="py-8"><EmptyState title="No interviews yet" subtitle="Add one once it's scheduled — it'll show up on your dashboard automatically." /></Card>
          ) : (
            [...interviews].sort((a, b) => a.date.localeCompare(b.date)).map((iv) => (
              <Card key={iv.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{formatDayLabel(iv.date)}{iv.time ? ` · ${formatTime(iv.time)}` : ""}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{iv.type}{iv.location ? ` · ${iv.location}` : ""}</p>
                  </div>
                  <select value={iv.outcome} onChange={(e) => updateInterview(iv.id, { outcome: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600">
                    {OUTCOMES.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
                {iv.notes && <p className="text-xs text-slate-500 mt-2">{iv.notes}</p>}
                <button onClick={() => deleteInterview(iv.id)} className="text-xs text-rose-500 mt-2">Remove</button>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "linkedin" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex-1 max-w-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>Networking progress</span><span>{contactedCount} / {CONTACT_TARGET}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#1E2A4A] rounded-full" style={{ width: `${Math.min(100, (contactedCount / CONTACT_TARGET) * 100)}%` }} />
              </div>
            </div>
            <GhostButton onClick={() => setShowAddContact(true)}><UserPlus size={14} /> Add Contact</GhostButton>
          </div>
          {contacts.length === 0 ? (
            <Card className="py-8"><EmptyState title="No contacts yet" subtitle="Add the employees you're reaching out to at this company to track connections and referrals." /></Card>
          ) : (
            contacts.map((c) => <ContactCard key={c.id} contact={c} updateContact={updateContact} deleteContact={deleteContact} />)
          )}
        </div>
      )}

      {tab === "notes" && (
        <Card className="p-4">
          {editingNotes ? (
            <>
              <textarea rows={6} className={inputCls} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} />
              <div className="flex gap-2 mt-2">
                <PrimaryButton onClick={() => { updateApplication(app.id, { notes: notesDraft }); setEditingNotes(false); }}>Save</PrimaryButton>
                <GhostButton onClick={() => { setNotesDraft(app.notes || ""); setEditingNotes(false); }}>Cancel</GhostButton>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600 whitespace-pre-wrap min-h-[2rem]">{app.notes || "No notes yet."}</p>
              <button onClick={() => setEditingNotes(true)} className="text-xs text-[#1E2A4A] font-semibold mt-2 flex items-center gap-1"><Edit3 size={12} /> Edit</button>
            </>
          )}
        </Card>
      )}

      {showAddInterview && (
        <InterviewFormModal onClose={() => setShowAddInterview(false)} onSubmit={(form) => { addInterview(app.id, form); setShowAddInterview(false); }} />
      )}
      {showAddContact && (
        <ContactFormModal onClose={() => setShowAddContact(false)} onSubmit={(form) => { addContact(app.id, form); setShowAddContact(false); }} />
      )}
      {showScheduleNext && (
        <Modal title="Schedule Next Follow-up" onClose={() => setShowScheduleNext(false)} footer={<>
          <GhostButton onClick={() => setShowScheduleNext(false)}>Cancel</GhostButton>
          <PrimaryButton onClick={() => { scheduleNextFollowUp(app.id, nextDate); setShowScheduleNext(false); }}>Schedule</PrimaryButton>
        </>}>
          <Field label="Next Follow-up Date">
            <input type="date" className={inputCls} value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
          </Field>
        </Modal>
      )}
    </div>
  );
}

function InterviewFormModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({ date: todayISO(), time: "", type: "HR Screening", location: "", meetingUrl: "", outcome: "Scheduled", notes: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Modal title="Add Interview" onClose={onClose} footer={<>
      <GhostButton onClick={onClose}>Cancel</GhostButton>
      <PrimaryButton onClick={() => onSubmit(form)}>Save Interview</PrimaryButton>
    </>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" required><input type="date" className={inputCls} value={form.date} onChange={(e) => set("date", e.target.value)} /></Field>
        <Field label="Time"><input type="time" className={inputCls} value={form.time} onChange={(e) => set("time", e.target.value)} /></Field>
      </div>
      <Field label="Interview Type">
        <select className={inputCls} value={form.type} onChange={(e) => set("type", e.target.value)}>{INTERVIEW_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Location"><input className={inputCls} value={form.location} onChange={(e) => set("location", e.target.value)} /></Field>
        <Field label="Meeting Link"><input className={inputCls} value={form.meetingUrl} onChange={(e) => set("meetingUrl", e.target.value)} /></Field>
      </div>
      <Field label="Notes"><textarea rows={2} className={inputCls} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
    </Modal>
  );
}

function ContactFormModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({ name: "", jobTitle: "", linkedinUrl: "", connectionStatus: "Not Contacted", notes: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Modal title="Add LinkedIn Contact" onClose={onClose} footer={<>
      <GhostButton onClick={onClose}>Cancel</GhostButton>
      <PrimaryButton onClick={() => form.name.trim() && onSubmit(form)}>Save Contact</PrimaryButton>
    </>}>
      <Field label="Name" required><input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Rahul Sharma" /></Field>
      <Field label="Job Title"><input className={inputCls} value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} placeholder="Product Manager" /></Field>
      <Field label="LinkedIn URL"><input className={inputCls} value={form.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} placeholder="https://linkedin.com/in/…" /></Field>
      <Field label="Connection Status">
        <select className={inputCls} value={form.connectionStatus} onChange={(e) => set("connectionStatus", e.target.value)}>{CONNECTION_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
      </Field>
    </Modal>
  );
}

function ContactCard({ contact: c, updateContact, deleteContact }) {
  const action = contactNextAction(c);
  const reminderDue = referralReminderDue(c);
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-slate-800">{c.name}</p>
          <p className="text-xs text-slate-500">{c.jobTitle}</p>
        </div>
        {c.linkedinUrl && <a href={c.linkedinUrl} target="_blank" rel="noreferrer" className="text-xs text-[#1E2A4A] font-medium flex items-center gap-1"><Linkedin size={12} /> Profile</a>}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <p className="text-xs text-slate-400 mb-1">Connection</p>
          <select value={c.connectionStatus} onChange={(e) => updateContact(c.id, { connectionStatus: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 w-full text-slate-600">
            {CONNECTION_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">Message Sent</p>
          <select value={c.messageSent ? "Yes" : "No"} onChange={(e) => updateContact(c.id, { messageSent: e.target.value === "Yes" })} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 w-full text-slate-600">
            <option>No</option><option>Yes</option>
          </select>
        </div>
        <div className="col-span-2">
          <p className="text-xs text-slate-400 mb-1">Referral Status</p>
          <select value={c.referralStatus} onChange={(e) => updateContact(c.id, { referralStatus: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 w-full text-slate-600">
            {REFERRAL_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {(action || reminderDue) && (
        <div className={`mt-3 text-xs rounded-lg px-2.5 py-2 flex items-center gap-1.5 ${reminderDue ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-500"}`}>
          {reminderDue ? <AlertTriangle size={13} /> : <MessageSquare size={13} />}
          {reminderDue ? "Check whether they responded to your message." : action}
        </div>
      )}

      <button onClick={() => deleteContact(c.id)} className="text-xs text-rose-500 mt-3">Remove contact</button>
    </Card>
  );
}

/* ============================== FOLLOW-UPS VIEW ============================== */

function FollowUpsView({ applications, companyName, openApp, markFollowedUp, scheduleNextFollowUp }) {
  const today = todayISO();
  const pending = applications.filter((a) => a.status === "Pending");
  const overdue = pending.filter((a) => computeFollowUpDue(a) && computeFollowUpDue(a) < today);
  const dueToday = pending.filter((a) => computeFollowUpDue(a) === today);
  const upcoming = pending.filter((a) => computeFollowUpDue(a) && computeFollowUpDue(a) > today).sort((a, b) => computeFollowUpDue(a).localeCompare(computeFollowUpDue(b)));
  const completed = applications.filter((a) => a.lastFollowUpDate).sort((a, b) => b.lastFollowUpDate.localeCompare(a.lastFollowUpDate)).slice(0, 15);

  const [scheduleFor, setScheduleFor] = useState(null);
  const [nextDate, setNextDate] = useState(addDays(today, FOLLOW_UP_DAYS));

  const Section = ({ title, tone, items, showDays }) => (
    <div>
      <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${tone === "negative" ? "text-rose-700" : tone === "warning" ? "text-amber-700" : tone === "success" ? "text-emerald-700" : "text-slate-500"}`}>{title} ({items.length})</p>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 mb-4">Nothing here.</p>
      ) : (
        <div className="space-y-2 mb-5">
          {items.map((a) => {
            const due = computeFollowUpDue(a);
            const days = due ? Math.abs(daysBetween(due, today)) : null;
            return (
              <Card key={a.id} className="p-3.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{a.position} · {companyName(a.companyId)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Applied {formatDate(a.appliedDate)} {due ? `· Follow-up ${formatDate(due)}` : ""}
                    {showDays && days != null ? ` · ${days} day${days === 1 ? "" : "s"} ${due < today ? "overdue" : "remaining"}` : ""}
                    {a.lastFollowUpDate ? ` · Last followed up ${formatDate(a.lastFollowUpDate)}` : ""}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <GhostButton onClick={() => openApp(a.id)}>Open</GhostButton>
                  {due && <PrimaryButton onClick={() => markFollowedUp(a.id)} className="!px-3 !py-1.5">Mark Followed Up</PrimaryButton>}
                  {!due && <GhostButton onClick={() => { setScheduleFor(a.id); setNextDate(addDays(today, FOLLOW_UP_DAYS)); }}>Schedule Next</GhostButton>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-1">
      <h1 className="text-xl font-bold text-slate-800 mb-4">Follow-ups</h1>
      <Section title="Overdue" tone="negative" items={overdue} showDays />
      <Section title="Due Today" tone="warning" items={dueToday} />
      <Section title="Upcoming" tone="info" items={upcoming} showDays />
      <Section title="Recently Followed Up" tone="success" items={completed} />

      {scheduleFor && (
        <Modal title="Schedule Next Follow-up" onClose={() => setScheduleFor(null)} footer={<>
          <GhostButton onClick={() => setScheduleFor(null)}>Cancel</GhostButton>
          <PrimaryButton onClick={() => { scheduleNextFollowUp(scheduleFor, nextDate); setScheduleFor(null); }}>Schedule</PrimaryButton>
        </>}>
          <Field label="Next Follow-up Date"><input type="date" className={inputCls} value={nextDate} onChange={(e) => setNextDate(e.target.value)} /></Field>
        </Modal>
      )}
    </div>
  );
}

/* ============================== INTERVIEWS VIEW ============================== */

function InterviewsView({ interviews, applications, companyName, openApp, updateInterview }) {
  const today = todayISO();
  const activeInterviews = interviews.filter((iv) => !applications.find((a) => a.id === iv.applicationId)?.archived);
  const appFor = (id) => applications.find((a) => a.id === id);

  const todays = activeInterviews.filter((iv) => iv.date === today);
  const upcoming = activeInterviews.filter((iv) => iv.date > today).sort((a, b) => a.date.localeCompare(b.date));
  const completed = activeInterviews.filter((iv) => iv.date < today || ["Completed", "Selected", "Rejected", "Cancelled"].includes(iv.outcome)).sort((a, b) => b.date.localeCompare(a.date));

  const Row = ({ iv }) => {
    const app = appFor(iv.applicationId);
    return (
      <Card className="p-3.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">{formatDayLabel(iv.date)}{iv.time ? ` · ${formatTime(iv.time)}` : ""} — {iv.type}</p>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{app ? `${app.position} · ${companyName(app.companyId)}` : "Application"}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select value={iv.outcome} onChange={(e) => updateInterview(iv.id, { outcome: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600">
            {OUTCOMES.map((o) => <option key={o}>{o}</option>)}
          </select>
          <GhostButton onClick={() => openApp(iv.applicationId)}>View <ChevronRight size={14} /></GhostButton>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-800">Interviews</h1>
      <section>
        <p className="text-xs font-bold text-sky-700 uppercase tracking-wide mb-2">Today</p>
        {todays.length === 0 ? <p className="text-sm text-slate-400">No interviews today.</p> : <div className="space-y-2">{todays.map((iv) => <Row key={iv.id} iv={iv} />)}</div>}
      </section>
      <section>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Upcoming</p>
        {upcoming.length === 0 ? <p className="text-sm text-slate-400">Nothing scheduled.</p> : <div className="space-y-2">{upcoming.map((iv) => <Row key={iv.id} iv={iv} />)}</div>}
      </section>
      <section>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Completed</p>
        {completed.length === 0 ? <p className="text-sm text-slate-400">No past interviews yet.</p> : <div className="space-y-2">{completed.slice(0, 20).map((iv) => <Row key={iv.id} iv={iv} />)}</div>}
      </section>
    </div>
  );
}

/* ============================== LINKEDIN OUTREACH VIEW ============================== */

function LinkedInView({ contacts, applications, companyName, openApp, updateContact }) {
  const [filter, setFilter] = useState("All");
  const appFor = (id) => applications.find((a) => a.id === id);
  const activeContacts = contacts.filter((c) => appFor(c.applicationId));

  const filtered = activeContacts.filter((c) => {
    switch (filter) {
      case "Request Pending": return c.connectionStatus === "Request Sent";
      case "Accepted": return c.connectionStatus === "Accepted";
      case "Message Sent": return c.messageSent;
      case "Referral Requested": return c.referralStatus === "Referral Requested";
      case "Referral Follow-up Due": return referralReminderDue(c);
      case "Referral Received": return c.referralStatus === "Referral Received";
      case "No Response": return c.connectionStatus === "No Response" || c.referralStatus === "No Response";
      default: return true;
    }
  });

  const grouped = {};
  filtered.forEach((c) => {
    const app = appFor(c.applicationId);
    const name = app ? companyName(app.companyId) : "Unknown";
    grouped[name] = grouped[name] || [];
    grouped[name].push(c);
  });

  const filters = ["All", "Request Pending", "Accepted", "Message Sent", "Referral Requested", "Referral Follow-up Due", "Referral Received", "No Response"];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">LinkedIn Outreach</h1>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border ${filter === f ? "bg-[#1E2A4A] text-white border-[#1E2A4A]" : "border-slate-200 text-slate-500"}`}>{f}</button>
        ))}
      </div>

      {Object.keys(grouped).length === 0 ? (
        <Card className="py-10"><EmptyState title="No networking activity" subtitle="Add LinkedIn contacts from an application's page to start tracking outreach here." /></Card>
      ) : (
        Object.entries(grouped).map(([company, list]) => (
          <div key={company}>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{company}</p>
            <div className="space-y-2 mb-4">
              {list.map((c) => {
                const reminderDue = referralReminderDue(c);
                return (
                  <Card key={c.id} className="p-3.5 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                      <p className="text-xs text-slate-500">{c.jobTitle}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <Badge tone={c.connectionStatus === "Accepted" ? "success" : "neutral"} icon={c.connectionStatus === "Accepted" ? CheckCircle2 : Circle}>{c.connectionStatus}</Badge>
                        {c.messageSent && <Badge tone="info" icon={CheckCircle2}>Message Sent</Badge>}
                        {reminderDue && <Badge tone="warning" icon={AlertTriangle}>Referral Follow-up Due</Badge>}
                        {!reminderDue && c.referralStatus !== "Not Asked" && c.referralStatus !== "Not Applicable" && <Badge tone="neutral">{c.referralStatus}</Badge>}
                      </div>
                    </div>
                    <GhostButton onClick={() => openApp(c.applicationId)}>Open <ChevronRight size={14} /></GhostButton>
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ============================== ANALYTICS VIEW ============================== */

function Bar({ label, value, max, tone = "bg-[#1E2A4A]" }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="mb-2.5">
      <div className="flex justify-between text-xs text-slate-500 mb-1"><span>{label}</span><span className="font-medium text-slate-700">{value}</span></div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function AnalyticsView({ applications, contacts, interviews }) {
  const today = todayISO();
  const thisWeekStart = addDays(today, -7);
  const thisMonthStart = addDays(today, -30);

  const total = applications.length;
  const thisWeek = applications.filter((a) => a.appliedDate >= thisWeekStart).length;
  const thisMonth = applications.filter((a) => a.appliedDate >= thisMonthStart).length;
  const interviewCount = applications.filter((a) => a.status === "Interview Call" || interviews.some((i) => i.applicationId === a.id)).length;
  const selected = applications.filter((a) => a.status === "Selected").length;

  const interviewRate = total > 0 ? Math.round((interviewCount / total) * 100) : 0;
  const selectionRate = total > 0 ? Math.round((selected / total) * 100) : 0;

  const bySource = {};
  applications.forEach((a) => { bySource[a.source] = (bySource[a.source] || 0) + 1; });
  const maxSource = Math.max(1, ...Object.values(bySource));

  const contacted = contacts.filter((c) => c.connectionStatus !== "Not Contacted").length;
  const accepted = contacts.filter((c) => c.connectionStatus === "Accepted").length;
  const messaged = contacts.filter((c) => c.messageSent).length;
  const referralsRequested = contacts.filter((c) => c.referralStatus !== "Not Asked" && c.referralStatus !== "Not Applicable").length;
  const referralsReceived = contacts.filter((c) => c.referralStatus === "Referral Received").length;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-800">Analytics</h1>

      <Card className="p-4">
        <p className="text-sm font-bold text-slate-700 mb-3">Application Metrics</p>
        <div className="grid grid-cols-3 gap-3">
          <div><p className="text-xl font-bold text-slate-800">{total}</p><p className="text-xs text-slate-500">Total Applications</p></div>
          <div><p className="text-xl font-bold text-slate-800">{thisWeek}</p><p className="text-xs text-slate-500">This Week</p></div>
          <div><p className="text-xl font-bold text-slate-800">{thisMonth}</p><p className="text-xs text-slate-500">This Month</p></div>
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-sm font-bold text-slate-700 mb-3">Funnel</p>
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
          <span className="font-semibold text-slate-700">Applied ({total})</span><ChevronRight size={14} /><span className="font-semibold text-slate-700">Interview ({interviewCount})</span><ChevronRight size={14} /><span className="font-semibold text-slate-700">Selected ({selected})</span>
        </div>
        <Bar label="Interview Conversion Rate" value={interviewRate} max={100} tone="bg-sky-500" />
        <Bar label="Selection Rate" value={selectionRate} max={100} tone="bg-emerald-500" />
      </Card>

      <Card className="p-4">
        <p className="text-sm font-bold text-slate-700 mb-3">Applications by Source</p>
        {Object.keys(bySource).length === 0 ? <p className="text-sm text-slate-400">No data yet.</p> :
          Object.entries(bySource).sort(([, a], [, b]) => b - a).map(([s, v]) => <Bar key={s} label={s} value={v} max={maxSource} />)}
      </Card>

      <Card className="p-4">
        <p className="text-sm font-bold text-slate-700 mb-3">Referral Analytics</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div><p className="text-lg font-bold text-slate-800">{contacted}</p><p className="text-xs text-slate-500">Employees Contacted</p></div>
          <div><p className="text-lg font-bold text-slate-800">{accepted}</p><p className="text-xs text-slate-500">Connections Accepted</p></div>
          <div><p className="text-lg font-bold text-slate-800">{messaged}</p><p className="text-xs text-slate-500">Messages Sent</p></div>
          <div><p className="text-lg font-bold text-slate-800">{referralsRequested}</p><p className="text-xs text-slate-500">Referrals Requested</p></div>
          <div><p className="text-lg font-bold text-slate-800">{referralsReceived}</p><p className="text-xs text-slate-500">Referrals Received</p></div>
        </div>
      </Card>
    </div>
  );
}

/* ============================== SETTINGS VIEW ============================== */

function SettingsView({ onExport, onImport, onResetDemo, onClearAll, counts }) {
  const [confirmClear, setConfirmClear] = useState(false);
  return (
    <div className="space-y-5 max-w-lg">
      <h1 className="text-xl font-bold text-slate-800">Settings</h1>

      <Card className="p-4">
        <p className="text-sm font-bold text-slate-700 mb-1">Your Data</p>
        <p className="text-xs text-slate-500 mb-3">{counts.applications} applications · {counts.contacts} LinkedIn contacts · {counts.interviews} interviews. Stored securely and privately to your account — never trapped in this app.</p>
        <div className="flex flex-wrap gap-2">
          <GhostButton onClick={onExport}><Download size={14} /> Export Data (JSON)</GhostButton>
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition cursor-pointer">
            <Upload size={14} /> Import Data
            <input type="file" accept=".json" className="hidden" onChange={(e) => e.target.files[0] && onImport(e.target.files[0])} />
          </label>
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-sm font-bold text-slate-700 mb-1">Demo Data</p>
        <p className="text-xs text-slate-500 mb-3">Restore the sample dataset to explore the app, or clear everything to start with your real job search.</p>
        <div className="flex flex-wrap gap-2">
          <GhostButton onClick={onResetDemo}><RotateCcw size={14} /> Restore Demo Data</GhostButton>
          {!confirmClear ? (
            <GhostButton onClick={() => setConfirmClear(true)} className="!text-rose-600"><Trash2 size={14} /> Clear All Data</GhostButton>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">This deletes everything. Sure?</span>
              <button onClick={() => { onClearAll(); setConfirmClear(false); }} className="text-rose-600 font-semibold">Yes, clear</button>
              <button onClick={() => setConfirmClear(false)} className="text-slate-400">Cancel</button>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-sm font-bold text-slate-700 mb-1">About This Pilot</p>
        <p className="text-xs text-slate-500 leading-relaxed">
          Follow-up dates default to 5 days after you apply. Referral check-in reminders appear 2 days after you mark a referral as requested.
          Both are calculated centrally, so every screen — Dashboard, Follow-ups, Applications — always agrees on what's due.
        </p>
      </Card>
    </div>
  );
}
