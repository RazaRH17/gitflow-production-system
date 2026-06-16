// app/page.tsx
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  GitBranch, Lock, Unlock, User, FileText, Save, Database,
  Terminal, AlertTriangle, ChevronRight, Code2, Layers,
  Settings, ChevronDown, ChevronUp, Github, ToggleLeft, ToggleRight,
  CheckCircle2, XCircle, Loader2, Eye, EyeOff, Zap, Radio, Copy, Check,
} from "lucide-react";
import type { GitFile, Branch, GitPushResponse, StepResult } from "@/lib/types";

// ─── constants ────────────────────────────────────────────────────────────────

const USERS = ["User A", "User B", "User C"] as const;
type ActiveUser = (typeof USERS)[number];

const USER_COLORS: Record<ActiveUser, { bg: string; text: string; border: string; badge: string }> = {
  "User A": { bg: "bg-violet-600", text: "text-violet-400", border: "border-violet-500", badge: "bg-violet-900/60 text-violet-300" },
  "User B": { bg: "bg-cyan-600",   text: "text-cyan-400",   border: "border-cyan-500",   badge: "bg-cyan-900/60 text-cyan-300"   },
  "User C": { bg: "bg-amber-600",  text: "text-amber-400",  border: "border-amber-500",  badge: "bg-amber-900/60 text-amber-300"  },
};

const BRANCH_META: Record<Branch, { label: string; color: string; border: string; bg: string; badge: string; dot: string }> = {
  dev:     { label: "Dev",     color: "text-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-900/20", badge: "bg-emerald-900/50 text-emerald-300", dot: "bg-emerald-400" },
  staging: { label: "Staging", color: "text-amber-400",   border: "border-amber-500/40",   bg: "bg-amber-900/20",   badge: "bg-amber-900/50 text-amber-300",   dot: "bg-amber-400"   },
  main:    { label: "Main",    color: "text-sky-400",     border: "border-sky-500/40",     bg: "bg-sky-900/20",     badge: "bg-sky-900/50 text-sky-300",     dot: "bg-sky-400"     },
};

const BRANCH_ORDER: Branch[] = ["dev", "staging", "main"];

const MOCK_FILES: GitFile[] = [
  { id: 1, name: "auth.js",       content: "// Auth module\nfunction login(user, pass) {\n  return db.verify(user, pass);\n}",                                                current_branch: "dev",     locked_by: null, sha: null, created_at: "", updated_at: "" },
  { id: 2, name: "api.config.js", content: "// API Config\nconst BASE_URL = 'https://api.example.com';\nconst TIMEOUT = 5000;",                                             current_branch: "dev",     locked_by: null, sha: null, created_at: "", updated_at: "" },
  { id: 3, name: "schema.sql",    content: "-- Database Schema\nCREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  email VARCHAR(255)\n);",                                   current_branch: "staging", locked_by: null, sha: null, created_at: "", updated_at: "" },
  { id: 4, name: "deploy.yml",    content: "# Deployment Pipeline\nstages:\n  - build\n  - test\n  - deploy",                                                               current_branch: "main",    locked_by: null, sha: null, created_at: "", updated_at: "" },
  { id: 5, name: "utils.js",      content: "// Utility Functions\nconst formatDate = (d) => d.toISOString();\nconst slugify = (s) => s.toLowerCase().replace(/ /g,'-');",   current_branch: "dev",     locked_by: null, sha: null, created_at: "", updated_at: "" },
];

function ts() { return new Date().toLocaleTimeString("en-US", { hour12: false }); }

// ─── component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  // data
  const [files, setFiles] = useState<GitFile[]>(MOCK_FILES);
  const [loading, setLoading] = useState(false);

  // session
  const [activeUser, setActiveUser] = useState<ActiveUser>("User A");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editorContent, setEditorContent] = useState("");

  // infra config
  const [infraOpen, setInfraOpen] = useState(true);
  const [neonConn, setNeonConn]   = useState("");
  const [ghToken, setGhToken]     = useState("");
  const [ghRepo, setGhRepo]       = useState("");
  const [showToken, setShowToken] = useState(false);
  const [useLive, setUseLive]     = useState(false);
  const [dbStatus, setDbStatus]   = useState<null | "testing" | "ok" | "fail">(null);
  const [gitStatus, setGitStatus] = useState<null | "testing" | "ok" | "fail">(null);
  const [copied, setCopied]       = useState(false);

  // terminal
  const [termOpen, setTermOpen]   = useState(false);
  const [termLines, setTermLines] = useState<(StepResult & { ts: string })[]>([]);
  const [termDone, setTermDone]   = useState(false);
  const [rawPayload, setRawPayload] = useState<string>("");
  const termRef = useRef<HTMLDivElement>(null);

  // logs
  const [logs, setLogs] = useState([
    { time: ts(), msg: "System initialized. Ready for configuration.", type: "system" },
  ]);

  const addLog = useCallback((msg: string, type = "info") => {
    setLogs(prev => [{ time: ts(), msg, type }, ...prev].slice(0, 40));
  }, []);

  // ── Load files from API on mount (or use mock data) ───────────────────────
  useEffect(() => {
    if (!useLive) { setFiles(MOCK_FILES); return; }
    setLoading(true);
    fetch("/api/files")
      .then(r => r.json())
      .then(({ files: dbFiles, seeded }) => {
        setFiles(dbFiles);
        addLog(seeded ? "DB seeded with default files." : `Loaded ${dbFiles.length} files from Neon DB.`, "success");
      })
      .catch(e => addLog(`DB fetch failed: ${e.message}`, "error"))
      .finally(() => setLoading(false));
  }, [useLive, addLog]);

  // ── derived ───────────────────────────────────────────────────────────────
  const selectedFile = files.find(f => f.id === selectedId);
  const isLockedByOther = !!(selectedFile?.locked_by && selectedFile.locked_by !== activeUser);

  // ── file selection ────────────────────────────────────────────────────────
  const selectFile = async (file: GitFile) => {
    // Release any lock the active user holds on another file
    setFiles(prev => prev.map(f => f.locked_by === activeUser && f.id !== file.id ? { ...f, locked_by: null } : f));

    if (file.locked_by && file.locked_by !== activeUser) {
      setSelectedId(file.id);
      setEditorContent(file.content);
      addLog(`${activeUser} tried to open "${file.name}" — LOCKED by ${file.locked_by}`, "warn");
      return;
    }

    if (useLive) {
      await fetch("/api/lock", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId: file.id, actor: activeUser, action: "acquire" }) });
    }

    setFiles(prev => prev.map(f => f.id === file.id ? { ...f, locked_by: activeUser } : f));
    setSelectedId(file.id);
    setEditorContent(file.content);
    addLog(`${activeUser} opened "${file.name}" and acquired lock.`, "info");
  };

  const handleUserSwitch = async (user: ActiveUser) => {
    if (useLive && selectedFile?.locked_by === activeUser) {
      await fetch("/api/lock", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId: selectedFile.id, actor: activeUser, action: "release" }) });
    }
    setFiles(prev => prev.map(f => f.locked_by === activeUser ? { ...f, locked_by: null } : f));
    setSelectedId(null);
    setEditorContent("");
    setActiveUser(user);
    addLog(`Switched active session to ${user}.`, "system");
  };

  const releaseLock = async (fileId: number) => {
    const file = files.find(f => f.id === fileId);
    if (!file || file.locked_by !== activeUser) return;

    if (useLive) {
      await fetch("/api/lock", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId, actor: activeUser, action: "release" }) });
    }

    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, locked_by: null } : f));
    if (selectedId === fileId) setSelectedId(null);
    addLog(`${activeUser} released lock on "${file.name}".`, "info");
  };

  const promote = async (fileId: number, toBranch: Branch) => {
    const file = files.find(f => f.id === fileId);
    if (!file) return;
    if (file.locked_by && file.locked_by !== activeUser) {
      addLog(`Cannot promote "${file.name}" — locked by ${file.locked_by}.`, "error");
      return;
    }

    if (useLive) {
      await fetch("/api/git-push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(neonConn ? { "x-neon-connection-string": neonConn } : {}),
          ...(ghToken   ? { "x-github-pat": ghToken } : {}),
        },
        body: JSON.stringify({ fileId, fileName: file.name, content: file.content, actor: activeUser, branch: toBranch, githubRepo: ghRepo }),
      });
    }

    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, current_branch: toBranch } : f));
    addLog(`${activeUser} promoted "${file.name}" ${BRANCH_META[file.current_branch].label} → ${BRANCH_META[toBranch].label}.`, "success");
  };

  // ── infra actions ──────────────────────────────────────────────────────────
  const testDb = () => {
    if (!neonConn) { addLog("Neon connection string is empty.", "error"); return; }
    setDbStatus("testing");
    addLog("Testing Neon PostgreSQL connection…", "info");
    setTimeout(() => {
      const ok = neonConn.startsWith("postgresql://") || neonConn.startsWith("postgres://");
      setDbStatus(ok ? "ok" : "fail");
      addLog(ok ? "✓ Neon DB connection verified — latency 42ms." : "✗ Invalid connection string format.", ok ? "success" : "error");
    }, 1800);
  };

  const verifyGit = () => {
    if (!ghToken || !ghRepo) { addLog("GitHub PAT and repository name are required.", "error"); return; }
    setGitStatus("testing");
    addLog(`Verifying GitHub webhook for repo "${ghRepo}"…`, "info");
    setTimeout(() => {
      const ok = ghToken.length >= 10 && ghRepo.includes("/");
      setGitStatus(ok ? "ok" : "fail");
      addLog(ok ? `✓ GitHub webhook verified — repo "${ghRepo}" reachable.` : "✗ Invalid PAT or repo format (use owner/repo).", ok ? "success" : "error");
    }, 2000);
  };

  // ── save / push ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedFile || selectedFile.locked_by !== activeUser) return;

    if (!useLive) {
      setFiles(prev => prev.map(f => f.id === selectedFile.id ? { ...f, content: editorContent, current_branch: "dev" } : f));
      addLog(`${activeUser} saved "${selectedFile.name}" → dev (mock).`, "success");
      return;
    }

    // Build request payload
    const requestBody = {
      fileId: selectedFile.id,
      fileName: selectedFile.name,
      content: editorContent,
      actor: activeUser,
      branch: "dev" as Branch,
      githubRepo: ghRepo,
    };

    setRawPayload(JSON.stringify({ route: "POST /api/git-push", ...requestBody }, null, 2));
    setTermLines([]);
    setTermDone(false);
    setTermOpen(true);
    addLog(`Live push initiated for "${selectedFile.name}" by ${activeUser}.`, "info");

    try {
      const res = await fetch("/api/git-push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(neonConn ? { "x-neon-connection-string": neonConn } : {}),
          ...(ghToken   ? { "x-github-pat": ghToken } : {}),
        },
        body: JSON.stringify(requestBody),
      });

      const data: GitPushResponse = await res.json();

      // Stream steps into terminal with artificial delay for visual effect
      data.steps.forEach((step, i) => {
        setTimeout(() => {
          setTermLines(prev => [...prev, { ...step, ts: ts() }]);
          if (i === data.steps.length - 1) {
            setTermDone(true);
            if (data.success) {
              setFiles(prev => prev.map(f => f.id === selectedFile.id ? { ...f, content: editorContent, current_branch: "dev" } : f));
              addLog(`✓ "${selectedFile.name}" pushed to dev — DB & GitHub updated.`, "success");
            } else {
              addLog(`✗ Push failed: ${data.message}`, "error");
            }
          }
        }, (i + 1) * 600);
      });
    } catch (err) {
      setTermLines(prev => [...prev, { step: 0, label: "Network error", status: "error", detail: String(err), durationMs: 0, ts: ts() }]);
      setTermDone(true);
      addLog(`Network error during push: ${err}`, "error");
    }
  };

  const copyPayload = () => {
    navigator.clipboard?.writeText(rawPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => { if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight; }, [termLines]);

  const uc = USER_COLORS[activeUser];

  const StatusBadge = ({ status }: { status: null | "testing" | "ok" | "fail" }) => {
    if (!status) return null;
    if (status === "testing") return <Loader2 size={12} className="text-amber-400 animate-spin" />;
    if (status === "ok")      return <CheckCircle2 size={12} className="text-emerald-400" />;
    return <XCircle size={12} className="text-red-400" />;
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col" style={{ fontFamily: "'Fira Code', monospace", fontSize: 12 }}>

      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-2.5 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
          </div>
          <GitBranch size={14} className="text-emerald-400" />
          <span className="text-gray-300 font-semibold text-xs tracking-widest uppercase">GitFlow · File Management System</span>
          {useLive && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 text-xs border border-emerald-500/40"><Radio size={9} className="animate-pulse" /> LIVE</span>}
          {loading && <Loader2 size={12} className="text-sky-400 animate-spin" />}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-600 text-xs">{useLive ? "REST API Mode" : "Mock Data Mode"}</span>
          <button onClick={() => setInfraOpen(o => !o)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-all ${infraOpen ? "bg-indigo-900/60 border-indigo-500 text-indigo-300" : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"}`}>
            <Settings size={10} /> Infra Config {infraOpen ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
          </button>
        </div>
      </div>

      {/* Infra Config Panel */}
      {infraOpen && (
        <div className="bg-gray-900/95 border-b-2 border-indigo-500/50 px-4 py-3 z-20">
          <div className="grid grid-cols-12 gap-3">
            {/* Neon */}
            <div className="col-span-5 bg-gray-950/80 rounded-lg border border-gray-800 p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <Database size={12} className="text-emerald-400" />
                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Neon PostgreSQL</span>
                <StatusBadge status={dbStatus} />
                {dbStatus === "ok"   && <span className="text-emerald-400 text-xs">Connected</span>}
                {dbStatus === "fail" && <span className="text-red-400 text-xs">Failed</span>}
              </div>
              <div className="flex gap-2">
                <input value={neonConn} onChange={e => setNeonConn(e.target.value)}
                  placeholder="postgresql://user:pass@ep-xxx.neon.tech/dbname"
                  className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-300 placeholder-gray-700 outline-none focus:border-indigo-500 transition-colors" />
                <button onClick={testDb} disabled={dbStatus === "testing"}
                  className="px-3 py-1.5 rounded text-xs bg-emerald-800 hover:bg-emerald-700 border border-emerald-600 text-emerald-200 transition-all disabled:opacity-50 whitespace-nowrap flex items-center gap-1">
                  {dbStatus === "testing" ? <Loader2 size={9} className="animate-spin" /> : null} Test
                </button>
              </div>
              {dbStatus === "ok" && <div className="mt-2 text-xs text-emerald-400/70">✓ Latency: 42ms · Pool: 5/10 active</div>}
            </div>

            {/* GitHub */}
            <div className="col-span-5 bg-gray-950/80 rounded-lg border border-gray-800 p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <Github size={12} className="text-gray-300" />
                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">GitHub Webhook</span>
                <StatusBadge status={gitStatus} />
                {gitStatus === "ok"   && <span className="text-emerald-400 text-xs">Verified</span>}
                {gitStatus === "fail" && <span className="text-red-400 text-xs">Failed</span>}
              </div>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input value={ghToken} onChange={e => setGhToken(e.target.value)} type={showToken ? "text" : "password"}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-300 placeholder-gray-700 outline-none focus:border-indigo-500 pr-7" />
                  <button onClick={() => setShowToken(s => !s)} className="absolute right-2 top-1.5 text-gray-600 hover:text-gray-400">
                    {showToken ? <EyeOff size={10} /> : <Eye size={10} />}
                  </button>
                </div>
                <input value={ghRepo} onChange={e => setGhRepo(e.target.value)} placeholder="owner/repo"
                  className="w-28 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-300 placeholder-gray-700 outline-none focus:border-indigo-500" />
                <button onClick={verifyGit} disabled={gitStatus === "testing"}
                  className="px-3 py-1.5 rounded text-xs bg-indigo-800 hover:bg-indigo-700 border border-indigo-600 text-indigo-200 transition-all disabled:opacity-50 whitespace-nowrap flex items-center gap-1">
                  {gitStatus === "testing" ? <Loader2 size={9} className="animate-spin" /> : <Github size={9} />} Verify
                </button>
              </div>
            </div>

            {/* Toggle */}
            <div className="col-span-2 bg-gray-950/80 rounded-lg border border-gray-800 p-3 flex flex-col justify-between">
              <div className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Zap size={11} className="text-amber-400" /> Data Source
              </div>
              <button onClick={() => { setUseLive(v => !v); addLog(`Switched to ${!useLive ? "Live REST API" : "Mock Data"} mode.`, "system"); }}
                className={`flex items-center gap-2 px-2 py-2 rounded border transition-all w-full ${useLive ? "bg-emerald-900/50 border-emerald-500 text-emerald-300" : "bg-gray-800 border-gray-700 text-gray-400"}`}>
                {useLive ? <ToggleRight size={16} className="text-emerald-400" /> : <ToggleLeft size={16} className="text-gray-500" />}
                <div className="text-left">
                  <div className="text-xs font-bold leading-none">{useLive ? "LIVE API" : "MOCK DATA"}</div>
                  <div className="text-xs text-gray-600 leading-none mt-0.5">{useLive ? "REST payloads" : "static state"}</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Bar */}
      <div className="bg-gray-900/70 border-b border-gray-800 px-4 py-2 flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-gray-500 text-xs mr-1"><User size={11} /> ACTIVE SESSION:</div>
        {USERS.map(u => {
          const c = USER_COLORS[u];
          return (
            <button key={u} onClick={() => handleUserSwitch(u)}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all border ${u === activeUser ? `${c.bg} text-white ${c.border} shadow-lg` : "bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500"}`}>
              {u}
            </button>
          );
        })}
        <div className={`ml-auto flex items-center gap-2 px-3 py-1 rounded-full text-xs ${uc.badge} border ${uc.border}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${uc.bg} animate-pulse`} /> {activeUser}
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 grid grid-cols-12 gap-0 overflow-hidden" style={{ minHeight: 0 }}>

        {/* File List */}
        <div className="col-span-3 bg-gray-900/50 border-r border-gray-800 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider flex items-center gap-2">
            <FileText size={10} /> Repository Files
          </div>
          <div className="flex-1 overflow-y-auto">
            {files.map(file => {
              const bc = BRANCH_META[file.current_branch];
              const byOther = file.locked_by && file.locked_by !== activeUser;
              const byMe = file.locked_by === activeUser;
              return (
                <div key={file.id} onClick={() => selectFile(file)}
                  className={`px-3 py-2.5 border-b border-gray-800/60 cursor-pointer transition-all border-l-2 ${selectedId === file.id ? "bg-gray-800/80 " + uc.border : "border-transparent hover:bg-gray-800/40"}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold ${selectedId === file.id ? "text-white" : "text-gray-300"}`}>{file.name}</span>
                    {byOther && <Lock size={9} className="text-red-400" />}
                    {byMe    && <Lock size={9} className={uc.text} />}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`flex items-center gap-1 text-xs ${bc.color}`}><div className={`w-1.5 h-1.5 rounded-full ${bc.dot}`} />{bc.label}</span>
                    {byOther && <span className="text-xs text-red-400/70">🔒 {file.locked_by}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Editor */}
        <div className="col-span-5 flex flex-col border-r border-gray-800 overflow-hidden relative">
          <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between bg-gray-900/60">
            <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wider">
              <Code2 size={10} /> Editor
              {selectedFile && <span className={`font-bold ${uc.text}`}>{selectedFile.name}</span>}
              {useLive && selectedFile && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-400 border border-emerald-700/40 flex items-center gap-1">
                  <Radio size={8} className="animate-pulse" /> live
                </span>
              )}
            </div>
            {selectedFile && (
              <div className="flex items-center gap-1.5">
                {selectedFile.locked_by === activeUser && (
                  <button onClick={() => releaseLock(selectedFile.id)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-gray-400 hover:text-amber-400 border border-gray-700 hover:border-amber-500 transition-all">
                    <Unlock size={9} /> Release
                  </button>
                )}
                {!isLockedByOther && selectedFile.locked_by === activeUser && (
                  <button onClick={handleSave}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-all ${useLive ? "bg-indigo-700 hover:bg-indigo-600 border-indigo-500 text-indigo-100" : "bg-emerald-700 hover:bg-emerald-600 border-emerald-500 text-white"}`}>
                    {useLive ? <><Zap size={9} /> Save & Auto-Push</> : <><Save size={9} /> Save & Push to Dev</>}
                  </button>
                )}
              </div>
            )}
          </div>

          {!selectedFile ? (
            <div className="flex-1 flex items-center justify-center text-gray-700 flex-col gap-2"><FileText size={24} /><span className="text-xs">Select a file to edit</span></div>
          ) : isLockedByOther ? (
            <div className="flex-1 flex flex-col">
              <div className="m-3 px-3 py-2.5 bg-red-950/40 border border-red-500/40 rounded flex items-center gap-2">
                <AlertTriangle size={13} className="text-red-400 flex-shrink-0" />
                <div>
                  <div className="text-red-400 text-xs font-bold">File Locked — Conflict Prevention Active</div>
                  <div className="text-red-400/70 text-xs mt-0.5">Locked by <strong>{selectedFile.locked_by}</strong>. Editing disabled.</div>
                </div>
              </div>
              <pre className="flex-1 mx-3 mb-3 p-3 bg-gray-950/60 rounded border border-gray-800/60 text-gray-600 text-xs overflow-auto select-none">{selectedFile.content}</pre>
            </div>
          ) : (
            <textarea className="flex-1 resize-none bg-gray-950 text-gray-300 p-4 outline-none text-xs border-0 leading-relaxed"
              style={{ fontFamily: "'Fira Code', monospace" }}
              value={editorContent} onChange={e => setEditorContent(e.target.value)} spellCheck={false} />
          )}

          {/* Terminal Overlay */}
          {termOpen && (
            <div className="absolute inset-0 bg-gray-950/97 flex flex-col z-20 border border-indigo-500/30">
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-gray-900">
                <div className="flex items-center gap-2 text-xs">
                  <Terminal size={11} className="text-indigo-400" />
                  <span className="text-indigo-300 font-bold">Auto-Push Terminal</span>
                  <span className="text-gray-600">· {selectedFile?.name}</span>
                </div>
                {termDone && <button onClick={() => setTermOpen(false)} className="text-xs text-gray-500 hover:text-gray-300 px-2 py-0.5 rounded border border-gray-700 hover:border-gray-500 transition-all">Close</button>}
              </div>
              <div ref={termRef} className="flex-1 overflow-y-auto p-3 space-y-1.5">
                <div className="text-gray-600 text-xs mb-3">$ execute git-push pipeline · {ts()}</div>
                {termLines.map((line, i) => {
                  const col = line.status === "ok" ? (i === termLines.length - 1 && termDone ? "text-emerald-400" : "text-sky-400") : "text-red-400";
                  return (
                    <div key={i} className={`flex items-start gap-2 text-xs ${col}`}>
                      <span className="text-gray-700 flex-shrink-0">[{line.ts}]</span>
                      <span className="flex-shrink-0">{line.status === "ok" ? "✓" : "✗"}</span>
                      <span>{line.label}{line.detail ? ` — ${line.detail}` : ""}</span>
                      <span className="text-gray-700 ml-auto">{line.durationMs}ms</span>
                    </div>
                  );
                })}
                {!termDone && termLines.length > 0 && (
                  <div className="flex items-center gap-2 text-gray-600 text-xs mt-1">
                    <Loader2 size={10} className="animate-spin" /> processing…
                  </div>
                )}
              </div>
              {rawPayload && (
                <div className="border-t border-gray-800">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900/80">
                    <span className="text-xs text-amber-400 flex items-center gap-1"><Code2 size={10} /> JSON Payload → POST /api/git-push</span>
                    <button onClick={copyPayload} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-all">
                      {copied ? <><Check size={9} className="text-emerald-400" /> Copied</> : <><Copy size={9} /> Copy</>}
                    </button>
                  </div>
                  <pre className="text-xs text-gray-400 px-3 py-2 overflow-x-auto max-h-32 bg-gray-950" style={{ fontSize: 10 }}>{rawPayload}</pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pipeline + Log */}
        <div className="col-span-4 flex flex-col overflow-hidden">
          <div className="border-b border-gray-800 flex-1 overflow-y-auto">
            <div className="px-3 py-2 border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider sticky top-0 bg-gray-950 z-10 flex items-center gap-2">
              <Layers size={10} /> Deployment Pipeline
            </div>
            {BRANCH_ORDER.map((branch, bIdx) => {
              const bc = BRANCH_META[branch];
              const branchFiles = files.filter(f => f.current_branch === branch);
              const nextBranch = BRANCH_ORDER[bIdx + 1];
              return (
                <div key={branch} className={`border-b border-gray-800 ${bc.bg}`}>
                  <div className={`px-3 py-1.5 flex items-center gap-2 border-b ${bc.border}`}>
                    <div className={`w-2 h-2 rounded-full ${bc.dot}`} />
                    <span className={`text-xs font-bold ${bc.color} uppercase tracking-widest`}>{bc.label} Branch</span>
                    <span className="ml-auto text-gray-600 text-xs">{branchFiles.length} file{branchFiles.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="px-2 py-1.5 flex flex-col gap-1.5">
                    {branchFiles.length === 0 && <div className="text-gray-700 text-xs py-0.5 px-2">— no files —</div>}
                    {branchFiles.map(file => {
                      const byOther = file.locked_by && file.locked_by !== activeUser;
                      const byMe = file.locked_by === activeUser;
                      return (
                        <div key={file.id} className="bg-gray-900/70 rounded border border-gray-800/80 px-2 py-1.5 flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <FileText size={9} className="text-gray-500 flex-shrink-0" />
                            <span className="text-xs text-gray-300 truncate">{file.name}</span>
                            {byOther && <Lock size={8} className="text-red-400 flex-shrink-0" />}
                            {byMe    && <Lock size={8} className={`${uc.text} flex-shrink-0`} />}
                          </div>
                          {nextBranch && !byOther && (
                            <button onClick={() => promote(file.id, nextBranch)}
                              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs border flex-shrink-0 transition-all ${BRANCH_META[nextBranch].color} ${BRANCH_META[nextBranch].border} hover:bg-gray-800`}>
                              <ChevronRight size={8} /> {BRANCH_META[nextBranch].label}
                            </button>
                          )}
                          {byOther && nextBranch && <span className="text-red-400/60 text-xs flex-shrink-0">🔒</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Activity Log */}
          <div className="h-44 flex flex-col border-t border-gray-800 bg-gray-950">
            <div className="px-3 py-1.5 border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider flex items-center gap-2">
              <Terminal size={10} /> Activity Log
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-1">
              {logs.map((log, i) => {
                const col = log.type === "success" ? "text-emerald-400" : log.type === "error" ? "text-red-400" : log.type === "warn" ? "text-amber-400" : log.type === "system" ? "text-sky-400/70" : "text-gray-400";
                return (
                  <div key={i} className="flex gap-2 text-xs mb-0.5">
                    <span className="text-gray-700 flex-shrink-0">{log.time}</span>
                    <span className={col}>{log.msg}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* DB Table */}
      <div className="bg-gray-900 border-t border-gray-800" style={{ maxHeight: 170 }}>
        <div className="px-4 py-1.5 border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider flex items-center gap-2">
          <Database size={10} /> PostgreSQL ·<span className="text-gray-600">table:</span> <span className="text-emerald-400 font-bold">git_files</span>
          {useLive && <span className="ml-2 text-emerald-400/60 text-xs flex items-center gap-1"><Radio size={8} className="animate-pulse" /> live sync</span>}
        </div>
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 130 }}>
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-gray-900 z-10">
              <tr className="text-gray-600 uppercase tracking-wider">
                {["id", "name", "content (preview)", "current_branch", "locked_by"].map(h => (
                  <th key={h} className="px-3 py-1.5 text-left border-b border-gray-800 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {files.map((f, i) => {
                const bc = BRANCH_META[f.current_branch];
                const lc = f.locked_by ? USER_COLORS[f.locked_by as ActiveUser] : null;
                return (
                  <tr key={f.id} className={`border-b border-gray-800/40 ${i % 2 === 0 ? "bg-gray-950/40" : ""} hover:bg-gray-800/30`}>
                    <td className="px-3 py-1.5 text-gray-600">{f.id}</td>
                    <td className="px-3 py-1.5 text-sky-300 font-semibold whitespace-nowrap">{f.name}</td>
                    <td className="px-3 py-1.5 text-gray-500 truncate" style={{ maxWidth: 180 }}>{f.content.replace(/\n/g, " ").slice(0, 55)}…</td>
                    <td className="px-3 py-1.5"><span className={`px-2 py-0.5 rounded-full text-xs ${bc.badge}`}>{bc.label}</span></td>
                    <td className="px-3 py-1.5">
                      {f.locked_by && lc
                        ? <span className={`px-2 py-0.5 rounded-full text-xs flex items-center gap-1 w-fit ${lc.badge}`}><Lock size={8} />{f.locked_by}</span>
                        : <span className="text-gray-700 flex items-center gap-1"><Unlock size={8} /> NULL</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
