// app/page.tsx
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  GitBranch, Lock, Unlock, User, FileText, Save, Database,
  Terminal, AlertTriangle, ChevronRight, Code2, Layers,
  Settings, ChevronDown, ChevronUp, Github, ToggleLeft, ToggleRight,
  CheckCircle2, XCircle, Loader2, Eye, EyeOff, Zap, Radio, Copy, Check, Plus
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
  dev:     { label: "Dev",      color: "text-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-900/20", badge: "bg-emerald-900/50 text-emerald-300", dot: "bg-emerald-400" },
  staging: { label: "Staging", color: "text-amber-400",   border: "border-amber-500/40",   bg: "bg-amber-900/20",   badge: "bg-amber-900/50 text-amber-300",   dot: "bg-amber-400"   },
  main:    { label: "Main",     color: "text-sky-400",      border: "border-sky-500/40",     bg: "bg-sky-900/20",     badge: "bg-sky-900/50 text-sky-300",     dot: "bg-sky-400"     },
};

const BRANCH_ORDER: Branch[] = ["dev", "staging", "main"];

const MOCK_FILES: GitFile[] = [
  { id: 1, name: "auth.js",       content: "// Auth module\nfunction login(user, pass) {\n  return db.verify(user, pass);\n}",                                current_branch: "dev",     locked_by: null, sha: null, created_at: "", updated_at: "" },
  { id: 2, name: "api.config.js", content: "// API Config\nconst BASE_URL = 'https://api.example.com';\nconst TIMEOUT = 5000;",                               current_branch: "dev",     locked_by: null, sha: null, created_at: "", updated_at: "" },
  { id: 3, name: "schema.sql",    content: "-- Database Schema\nCREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  email VARCHAR(255)\n);",                               current_branch: "staging", locked_by: null, sha: null, created_at: "", updated_at: "" },
  { id: 4, name: "deploy.yml",    content: "# Deployment Pipeline\nstages:\n  - build\n  - test\n  - deploy",                                                               current_branch: "main",    locked_by: null, sha: null, created_at: "", updated_at: "" },
  { id: 5, name: "utils.js",      content: "// Utility Functions\nconst formatDate = (d) => d.toISOString();\nconst slugify = (s) => s.toLowerCase().replace(/ /g,'-');",   current_branch: "dev",     locked_by: null, sha: null, created_at: "", updated_at: "" },
];

function ts() { return new Date().toLocaleTimeString("en-US", { hour12: false }); }

export default function Dashboard() {
  // data
  const [files, setFiles] = useState<GitFile[]>(MOCK_FILES);
  const [loading, setLoading] = useState(false);

  // session
  const [activeUser, setActiveUser] = useState<ActiveUser>("User A");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editorContent, setEditorContent] = useState("");

  // infra config states
  const [infraOpen, setInfraOpen] = useState(true);
  const [neonConn, setNeonConn]   = useState("");
  const [ghToken, setGhToken]     = useState("");
  const [ghRepo, setGhRepo]       = useState("");
  const [showToken, setShowToken] = useState(false);
  const [useLive, setUseLive]     = useState(false);
  const [dbStatus, setDbStatus]   = useState<null | "testing" | "ok" | "fail">(null);
  const [gitStatus, setGitStatus] = useState<null | "testing" | "ok" | "fail">(null);

  // add file states
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileContent, setNewFileContent] = useState("");

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

  // Load files hook
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

  const selectedFile = files.find(f => f.id === selectedId);
  const isLockedByOther = !!(selectedFile?.locked_by && selectedFile.locked_by !== activeUser);

  const selectFile = async (file: GitFile) => {
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

  const testDb = () => {
    if (!neonConn) { addLog("Neon connection string is empty.", "error"); return; }
    setDbStatus("testing");
    addLog("Testing Neon PostgreSQL connection…", "info");
    setTimeout(() => {
      const ok = neonConn.startsWith("postgresql://") || neonConn.startsWith("postgres://");
      setDbStatus(ok ? "ok" : "fail");
      addLog(ok ? "✓ Neon DB connection verified." : "✗ Invalid connection string format.", ok ? "success" : "error");
    }, 1500);
  };

  const verifyGit = () => {
    if (!ghToken || !ghRepo) { addLog("GitHub PAT and repository name are required.", "error"); return; }
    setGitStatus("testing");
    addLog(`Verifying GitHub repo "${ghRepo}"…`, "info");
    setTimeout(() => {
      const ok = ghToken.length >= 10 && ghRepo.includes("/");
      setGitStatus(ok ? "ok" : "fail");
      addLog(ok ? `✓ GitHub verified successfully.` : "✗ Invalid PAT or repo format.", ok ? "success" : "error");
    }, 1500);
  };

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;

    const formattedName = newFileName.trim().replace(/\s+/g, "-");
    const newFile: GitFile = {
      id: Date.now(),
      name: formattedName.includes(".") ? formattedName : `${formattedName}.js`,
      content: newFileContent || "// New file template",
      current_branch: "dev",
      locked_by: null,
      sha: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (useLive) {
      try {
        const res = await fetch("/api/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newFile)
        });
        if (!res.ok) throw new Error("Database error");
        addLog(`✓ Saved "${newFile.name}" to Neon DB permanently.`, "success");
      } catch (err) {
        addLog(`✗ Sync Error: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    }

    setFiles(prev => [...prev, newFile]);
    addLog(`✓ Created file "${newFile.name}" on [Dev]`, "success");
    setNewFileName("");
    setNewFileContent("");
    setAddModalOpen(false);
  };

  const handleSave = async () => {
    if (!selectedFile || selectedFile.locked_by !== activeUser) return;

    if (!useLive) {
      setFiles(prev => prev.map(f => f.id === selectedFile.id ? { ...f, content: editorContent, current_branch: "dev" } : f));
      addLog(`${activeUser} saved "${selectedFile.name}" (mock mode).`, "success");
      return;
    }

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
      data.steps.forEach((step, i) => {
        setTimeout(() => {
          setTermLines(prev => [...prev, { ...step, ts: ts() }]);
          if (i === data.steps.length - 1) {
            setTermDone(true);
            if (data.success) {
              setFiles(prev => prev.map(f => f.id === selectedFile.id ? { ...f, content: editorContent, current_branch: "dev" } : f));
              addLog(`✓ "${selectedFile.name}" successfully synced with Live Services.`, "success");
            } else {
              addLog(`✗ Push failed: ${data.message}`, "error");
            }
          }
        }, (i + 1) * 500);
      });
    } catch (err) {
      setTermLines(prev => [...prev, { step: 0, label: "Network error", status: "error", detail: String(err), durationMs: 0, ts: ts() }]);
      setTermDone(true);
    }
  };

  useEffect(() => { if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight; }, [termLines]);

  const uc = USER_COLORS[activeUser];

  const StatusBadge = ({ status }: { status: null | "testing" | "ok" | "fail" }) => {
    if (!status) return null;
    if (status === "testing") return <Loader2 size={12} className="text-amber-400 animate-spin" />;
    if (status === "ok")      return <CheckCircle2 size={12} className="text-emerald-400" />;
    return <XCircle size={12} className="text-red-400" />;
  };

  return (
    <div className="w-full min-h-screen bg-gray-950 text-gray-100 flex flex-col relative" style={{ fontFamily: "'Fira Code', monospace", fontSize: 12 }}>

      {/* 1. Fixed Header */}
      <div className="w-full bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
          </div>
          <GitBranch size={14} className="text-emerald-400" />
          <span className="text-gray-200 font-bold tracking-wider uppercase text-xs">GitFlow Infra Manager</span>
          {useLive && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-300 border border-emerald-500 text-[10px]"><Radio size={9} className="animate-pulse" /> LIVE SYNC</span>}
        </div>
        <button onClick={() => setInfraOpen(o => !o)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded border transition-all text-xs font-semibold ${infraOpen ? "bg-indigo-950 border-indigo-500 text-indigo-300" : "bg-gray-800 border-gray-700 text-gray-400"}`}>
          <Settings size={12} /> Database & GitHub Config {infraOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>
      </div>

      {/* 2. DEDICATED FULL-WIDTH INFRA PANEL (Now independent of columns to avoid getting squeezed) */}
      {infraOpen && (
        <div className="w-full bg-gray-900 border-b-2 border-indigo-500 p-4 block">
          <div className="w-full flex flex-col md:flex-row gap-4 items-stretch">
            
            {/* Postgres Panel */}
            <div className="flex-1 min-w-[280px] bg-gray-950 rounded-lg border border-gray-800 p-3.5 shadow-inner">
              <div className="flex items-center gap-2 mb-2">
                <Database size={14} className="text-emerald-400" />
                <span className="font-bold text-gray-200 uppercase tracking-wider text-xs">Neon PostgreSQL Configuration</span>
                <StatusBadge status={dbStatus} />
              </div>
              <div className="flex gap-2">
                <input value={neonConn} onChange={e => setNeonConn(e.target.value)}
                  placeholder="postgresql://user:pass@ep-silent-cloud-xxxx.neon.tech/neondb"
                  className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-xs text-emerald-300 font-mono outline-none focus:border-indigo-500" />
                <button onClick={testDb} disabled={dbStatus === "testing"}
                  className="px-4 py-2 rounded text-xs bg-emerald-800 hover:bg-emerald-700 font-bold text-white border border-emerald-600 transition-all disabled:opacity-50 flex items-center gap-1">
                  Connect
                </button>
              </div>
              <p className="text-[10px] text-gray-500 mt-1.5">Enter your Neon connection string to enable automated row locks syncing.</p>
            </div>

            {/* GitHub Panel */}
            <div className="flex-1 min-w-[280px] bg-gray-950 rounded-lg border border-gray-800 p-3.5 shadow-inner">
              <div className="flex items-center gap-2 mb-2">
                <Github size={14} className="text-indigo-400" />
                <span className="font-bold text-gray-200 uppercase tracking-wider text-xs">GitHub Repository Integration</span>
                <StatusBadge status={gitStatus} />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input value={ghToken} onChange={e => setGhToken(e.target.value)} type={showToken ? "text" : "password"}
                    placeholder="GitHub Personal Access Token (ghp_...)"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-xs text-gray-300 outline-none focus:border-indigo-500 pr-8" />
                  <button type="button" onClick={() => setShowToken(s => !s)} className="absolute right-2.5 top-2.5 text-gray-500 hover:text-gray-300">
                    {showToken ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
                <input value={ghRepo} onChange={e => setGhRepo(e.target.value)} placeholder="owner/repo-name"
                  className="w-36 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-xs text-gray-300 outline-none focus:border-indigo-500" />
                <button onClick={verifyGit} disabled={gitStatus === "testing"}
                  className="px-4 py-2 rounded text-xs bg-indigo-800 hover:bg-indigo-700 font-bold text-white border border-indigo-600 transition-all disabled:opacity-50">
                  Verify Git
                </button>
              </div>
              <p className="text-[10px] text-gray-500 mt-1.5">Connect repo to route code pushes to feature branches automatically.</p>
            </div>

            {/* Live Mode Controls */}
            <div className="w-full md:w-56 bg-gray-950 rounded-lg border border-gray-800 p-3.5 flex flex-col justify-between">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1"><Zap size={12} className="text-amber-400" /> Mode Switcher</div>
              <button onClick={() => { setUseLive(v => !v); addLog(`Switched sync Engine.`, "system"); }}
                className={`flex items-center gap-2.5 px-3 py-2 rounded border transition-all mt-2 w-full ${useLive ? "bg-emerald-950/80 border-emerald-500 text-emerald-400" : "bg-gray-800 border-gray-700 text-gray-400"}`}>
                {useLive ? <ToggleRight size={20} className="text-emerald-400" /> : <ToggleLeft size={20} className="text-gray-500" />}
                <div className="text-left leading-tight">
                  <div className="text-xs font-bold">{useLive ? "LIVE REST API" : "MOCK ENGINE"}</div>
                  <div className="text-[10px] text-gray-500">Click to swap</div>
                </div>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 3. Session Info Bar */}
      <div className="w-full bg-gray-900/60 border-b border-gray-800 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 uppercase font-semibold text-[11px]">Choose Session Simulator:</span>
          {USERS.map(u => (
            <button key={u} onClick={() => handleUserSwitch(u)}
              className={`px-3 py-1 rounded text-xs font-bold border transition-all ${u === activeUser ? `${USER_COLORS[u].bg} text-white ${USER_COLORS[u].border}` : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"}`}>
              {u}
            </button>
          ))}
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-mono border ${uc.badge} ${uc.border} flex items-center gap-1.5`}>
          <div className={`w-2 h-2 rounded-full ${uc.bg} animate-pulse`} /> Active: {activeUser}
        </div>
      </div>

      {/* 4. Core Layout Workspace */}
      <div className="flex-1 grid grid-cols-12 gap-0 overflow-hidden min-h-0">
        
        {/* Left Side: Repo List */}
        <div className="col-span-3 bg-gray-900/20 border-r border-gray-800 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-800 text-gray-400 font-bold flex items-center justify-between bg-gray-900/40">
            <span className="flex items-center gap-1.5"><FileText size={12} /> Repository Explorer</span>
            <button onClick={() => setAddModalOpen(true)} className="flex items-center gap-0.5 text-emerald-400 border border-emerald-500/40 bg-emerald-950/20 hover:bg-emerald-950/60 px-2 py-0.5 rounded transition-all text-[11px]">
              <Plus size={11} /> File
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {files.map(file => {
              const bc = BRANCH_META[file.current_branch];
              const byOther = file.locked_by && file.locked_by !== activeUser;
              return (
                <div key={file.id} onClick={() => selectFile(file)}
                  className={`px-3 py-3 border-b border-gray-800/60 cursor-pointer transition-all border-l-2 ${selectedId === file.id ? "bg-gray-800/60 " + uc.border : "border-transparent hover:bg-gray-900/40"}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold ${selectedId === file.id ? "text-white" : "text-gray-300"}`}>{file.name}</span>
                    {file.locked_by && <Lock size={10} className={byOther ? "text-red-400" : uc.text} />}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`flex items-center gap-1 text-[11px] ${bc.color}`}><div className={`w-1.5 h-1.5 rounded-full ${bc.dot}`} />{bc.label}</span>
                    {file.locked_by && <span className="text-[10px] px-1 rounded bg-gray-950 text-gray-500">locked: {file.locked_by}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Middle Side: Editor Workspace */}
        <div className="col-span-5 flex flex-col border-r border-gray-800 overflow-hidden relative bg-gray-950">
          <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between bg-gray-900/40">
            <div className="flex items-center gap-2 text-gray-400 text-xs">
              <Code2 size={12} /> Working Copy: {selectedFile ? <span className={`font-bold ${uc.text}`}>{selectedFile.name}</span> : <span className="text-gray-600">None</span>}
            </div>
            {selectedFile && selectedFile.locked_by === activeUser && (
              <div className="flex items-center gap-1.5">
                <button onClick={() => releaseLock(selectedFile.id)} className="px-2 py-0.5 rounded text-[11px] text-gray-400 hover:text-amber-400 border border-gray-700 hover:border-amber-500 transition-all">Release</button>
                <button onClick={handleSave} className="px-2.5 py-1 rounded text-[11px] bg-indigo-600 hover:bg-indigo-500 border border-indigo-400 font-bold text-white flex items-center gap-1">
                  <Save size={11} /> Save & Sync
                </button>
              </div>
            )}
          </div>

          {!selectedFile ? (
            <div className="flex-1 flex items-center justify-center text-gray-600 flex-col gap-1.5"><FileText size={20} className="opacity-40" /><span>Select a source code file from explorer</span></div>
          ) : isLockedByOther ? (
            <div className="flex-1 flex flex-col p-3">
              <div className="p-3 bg-red-950/40 border border-red-500/40 rounded flex items-center gap-2 mb-3">
                <AlertTriangle size={14} className="text-red-400" />
                <div className="text-xs text-red-400"><strong>Protected:</strong> Mutex lock held by <strong>{selectedFile.locked_by}</strong>. View-only mode.</div>
              </div>
              <pre className="flex-1 bg-gray-900 p-3 rounded border border-gray-800 text-gray-600 text-xs overflow-auto select-none leading-relaxed">{selectedFile.content}</pre>
            </div>
          ) : (
            <textarea className="flex-1 resize-none bg-gray-950 text-gray-300 p-4 outline-none text-xs leading-relaxed font-mono"
              value={editorContent} onChange={e => setEditorContent(e.target.value)} spellCheck={false} />
          )}

          {/* Terminal Box Overlay */}
          {termOpen && (
            <div className="absolute inset-0 bg-gray-950/95 flex flex-col z-20 border-t border-indigo-500">
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-gray-900">
                <span className="text-indigo-400 font-bold flex items-center gap-1.5"><Terminal size={12} /> Live Sync Operations Terminal</span>
                {termDone && <button onClick={() => setTermOpen(false)} className="text-[11px] bg-gray-800 border border-gray-700 hover:border-gray-500 px-2 py-0.5 rounded text-gray-300">Close terminal</button>}
              </div>
              <div ref={termRef} className="flex-1 overflow-y-auto p-4 space-y-1 bg-black font-mono text-xs">
                {termLines.map((line, i) => (
                  <div key={i} className={line.status === "ok" ? "text-sky-400" : "text-red-400"}>
                    <span className="text-gray-600">[{line.ts}]</span> {line.status === "ok" ? "✓" : "✗"} {line.label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Pipelines & Logs */}
        <div className="col-span-4 flex flex-col overflow-hidden">
          <div className="border-b border-gray-800 flex-1 overflow-y-auto">
            <div className="px-3 py-2 border-b border-gray-800 text-gray-400 font-bold sticky top-0 bg-gray-950 z-10 flex items-center gap-1.5 bg-gray-900/20">
              <Layers size={12} /> CI/CD Deployment Mapping
            </div>
            {BRANCH_ORDER.map((branch, bIdx) => {
              const bc = BRANCH_META[branch];
              const branchFiles = files.filter(f => f.current_branch === branch);
              const nextBranch = BRANCH_ORDER[bIdx + 1];
              return (
                <div key={branch} className={`border-b border-gray-800/80 ${bc.bg} pb-2`}>
                  <div className={`px-3 py-1.5 flex items-center gap-2 border-b ${bc.border} mb-2 bg-gray-950/40`}>
                    <div className={`w-2 h-2 rounded-full ${bc.dot}`} />
                    <span className={`text-xs font-bold ${bc.color} uppercase tracking-wider`}>{bc.label} Environment</span>
                  </div>
                  <div className="px-3 flex flex-col gap-1.5">
                    {branchFiles.length === 0 && <div className="text-gray-700 text-xs py-1 italic">No active files matching tier</div>}
                    {branchFiles.map(file => (
                      <div key={file.id} className="bg-gray-900 border border-gray-800 rounded px-2.5 py-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-300 truncate font-medium">{file.name}</span>
                        {nextBranch && (
                          <button onClick={() => promote(file.id, nextBranch)}
                            className={`flex items-center gap-0.5 px-2 py-0.5 rounded text-[11px] border font-semibold transition-all ${BRANCH_META[nextBranch].color} ${BRANCH_META[nextBranch].border} hover:bg-gray-800`}>
                            Promote <ChevronRight size={10} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="h-40 bg-gray-950 flex flex-col overflow-hidden border-t border-gray-800">
            <div className="px-3 py-1.5 border-b border-gray-800 text-gray-500 font-semibold text-[11px]">SYSTEM LOGGER</div>
            <div className="flex-1 overflow-y-auto p-2.5 space-y-1 font-mono text-[11px]">
              {logs.map((log, idx) => (
                <div key={idx} className="text-gray-400 flex gap-1.5 truncate">
                  <span className="text-gray-600">[{log.time}]</span> <span>{log.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* File Creation Modal Box */}
      {addModalOpen && (
        <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-indigo-500 rounded-lg w-full max-w-sm shadow-2xl">
            <div className="bg-gray-950 px-4 py-2.5 border-b border-gray-800 flex items-center gap-2 text-indigo-400 font-bold">
              <Plus size={14} /> New Repository Node
            </div>
            <form onSubmit={handleCreateFile} className="p-4 space-y-3">
              <div>
                <label className="block text-gray-500 text-[10px] uppercase font-bold mb-1">Target Name</label>
                <input type="text" required placeholder="config.json" value={newFileName} onChange={e => setNewFileName(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-700 rounded px-2.5 py-2 text-xs text-gray-200 outline-none font-mono focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-gray-500 text-[10px] uppercase font-bold mb-1">Boilerplate Raw Text</label>
                <textarea placeholder="// content goes here" value={newFileContent} onChange={e => setNewFileContent(e.target.value)} rows={3}
                  className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-gray-200 outline-none font-mono resize-none focus:border-indigo-500" />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-800">
                <button type="button" onClick={() => setAddModalOpen(false)} className="px-3 py-1.5 rounded text-xs bg-gray-800 text-gray-400">Abort</button>
                <button type="submit" className="px-4 py-1.5 rounded text-xs bg-emerald-700 text-white font-bold">Commit Creation</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
