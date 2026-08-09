import { useState, useEffect, useRef } from "react";
import { 
    Upload, 
    FileText, 
    Cpu, 
    AlertTriangle, 
    CheckCircle2, 
    XCircle, 
    Terminal, 
    Lightbulb, 
    Copy, 
    Check, 
    RefreshCw, 
    Sparkles,
    Activity,
    ShieldAlert,
    GitBranch,
    History,
    Database,
    Search,
    ExternalLink,
    Settings,
    User,
    FolderGit2,
    ListFilter,
    Key,
    ChevronDown,
    ChevronUp,
    LogOut,
    Github
} from "lucide-react";
import api from "../services/api";
import { supabase } from "../services/supabase";

function Dashboard() {
    // Auth State (Supabase / GitHub OAuth)
    const [session, setSession] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [githubToken, setGithubToken] = useState(() => localStorage.getItem("gh_token") || "");

    // Repository State
    const [owner, setOwner] = useState(() => localStorage.getItem("gh_owner") || "AidonPatrao");
    const [repo, setRepo] = useState(() => localStorage.getItem("gh_repo") || "ai-llm-rag-analyzer");
    const [showConfig, setShowConfig] = useState(false);

    // Auto-discovered user repositories list
    const [userRepos, setUserRepos] = useState([]);
    const [loadingRepos, setLoadingRepos] = useState(false);

    // Navigation state
    const [activeTab, setActiveTab] = useState("dashboard");
    const [file, setFile] = useState(null);
    const [logText, setLogText] = useState("");
    const [inputMode, setInputMode] = useState("file");
    
    // Data states from backend
    const [metrics, setMetrics] = useState(null);
    const [risk, setRisk] = useState(null);
    const [runs, setRuns] = useState([]);
    const [failedBuilds, setFailedBuilds] = useState([]);
    const [incidents, setIncidents] = useState([]);
    
    // UI States
    const [expandedRunId, setExpandedRunId] = useState(null);
    const [analysisResult, setAnalysisResult] = useState(null);
    const [loadingAnalysis, setLoadingAnalysis] = useState(false);
    const [loadingData, setLoadingData] = useState(true);
    const [errorMsg, setErrorMsg] = useState("");
    const [copied, setCopied] = useState(false);
    
    // Log Viewer modal state
    const [viewingLogId, setViewingLogId] = useState(null);
    const [logPreview, setLogPreview] = useState("");
    const [loadingLog, setLoadingLog] = useState(false);

    const fileInputRef = useRef(null);

    // Parse URL params for OAuth callback tokens
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get("token");
        const urlOwner = urlParams.get("owner");
        if (token) {
            setGithubToken(token);
            localStorage.setItem("gh_token", token);
            if (urlOwner) {
                setOwner(urlOwner);
                localStorage.setItem("gh_owner", urlOwner);
            }
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        // Supabase Auth listener
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (session?.provider_token) {
                setGithubToken(session.provider_token);
                localStorage.setItem("gh_token", session.provider_token);
            }
            if (session?.user) {
                const username = session.user.user_metadata?.preferred_username || session.user.user_metadata?.user_name || "AidonPatrao";
                setUserProfile(session.user);
                setOwner(username);
                localStorage.setItem("gh_owner", username);
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session?.provider_token) {
                setGithubToken(session.provider_token);
                localStorage.setItem("gh_token", session.provider_token);
            }
            if (session?.user) {
                const username = session.user.user_metadata?.preferred_username || session.user.user_metadata?.user_name || "AidonPatrao";
                setUserProfile(session.user);
                setOwner(username);
                localStorage.setItem("gh_owner", username);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    // GitHub OAuth Login via Supabase Auth
    const handleGitHubLogin = async () => {
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: "github",
                options: {
                    redirectTo: window.location.origin,
                    scopes: "repo read:org workflow"
                }
            });
            if (error) {
                // Fallback direct backend OAuth redirect
                window.location.href = "http://localhost:3000/api/auth/github";
            }
        } catch (e) {
            window.location.href = "http://localhost:3000/api/auth/github";
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setSession(null);
        setUserProfile(null);
        setGithubToken("");
        localStorage.removeItem("gh_token");
    };

    // Helper for API headers
    const getHeaders = (overrideOwner = owner, overrideRepo = repo, overridePat = githubToken) => ({
        headers: {
            "Authorization": overridePat ? `Bearer ${overridePat}` : "",
            "x-github-owner": overrideOwner,
            "x-github-repo": overrideRepo,
            "x-github-pat": overridePat
        }
    });

    // Auto-fetch user's repository list
    const fetchUserRepositories = async () => {
        setLoadingRepos(true);
        try {
            const res = await api.get("/api/github/user-repos", getHeaders());
            if (res.data?.success) {
                setUserRepos(res.data.repos || []);
            }
        } catch (err) {
            console.warn("Could not fetch user repos:", err);
        } finally {
            setLoadingRepos(false);
        }
    };

    useEffect(() => {
        if (showConfig) {
            fetchUserRepositories();
        }
    }, [showConfig, owner, githubToken]);

    const selectRepository = (selectedOwner, selectedRepo) => {
        setOwner(selectedOwner);
        setRepo(selectedRepo);
        localStorage.setItem("gh_owner", selectedOwner);
        localStorage.setItem("gh_repo", selectedRepo);
        setShowConfig(false);
    };

    // Fetch initial backend metrics & runs
    const fetchDashboardData = async () => {
        setLoadingData(true);
        try {
            const config = getHeaders();
            const [metricsRes, riskRes, runsRes, failedRes, incidentsRes] = await Promise.allSettled([
                api.get("/metrics", config),
                api.get("/risk-analysis", config),
                api.get("/github", config),
                api.get("/failed-builds", config),
                api.get("/api/incidents", config)
            ]);

            if (metricsRes.status === "fulfilled") setMetrics(metricsRes.value.data);
            if (riskRes.status === "fulfilled") setRisk(riskRes.value.data);
            if (runsRes.status === "fulfilled") setRuns(runsRes.value.data.runs || []);
            if (failedRes.status === "fulfilled") setFailedBuilds(failedRes.value.data.failed_builds || []);
            if (incidentsRes.status === "fulfilled") setIncidents(incidentsRes.value.data.incidents || []);
        } catch (err) {
            console.error("Dashboard fetch error:", err);
        } finally {
            setLoadingData(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
    }, [owner, repo, githubToken]);

    // Manual Log Analysis (RAG + Granite LLM)
    const runAIAnalysis = async (customLog = null, runId = "manual") => {
        const textToAnalyze = customLog || (inputMode === "text" ? logText : null);
        
        if (inputMode === "file" && !file && !customLog) {
            setErrorMsg("Please select or drop a log file first.");
            return;
        }
        if (inputMode === "text" && !textToAnalyze?.trim()) {
            setErrorMsg("Please paste log trace text.");
            return;
        }

        setErrorMsg("");
        setLoadingAnalysis(true);
        setAnalysisResult(null);

        try {
            let res;
            const config = getHeaders();
            if (inputMode === "file" && file && !customLog) {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("run_id", runId);
                res = await api.post("/analyze", formData, {
                    ...config,
                    headers: { 
                        ...config.headers, 
                        "Content-Type": "multipart/form-data" 
                    }
                });
            } else {
                res = await api.post("/analyze", { log: textToAnalyze, run_id: runId }, config);
            }

            setAnalysisResult(res.data);
            fetchDashboardData();
        } catch (err) {
            console.error("Analysis Error:", err);
            setErrorMsg(err.response?.data?.root_cause || err.message || "Failed to analyze log.");
        } finally {
            setLoadingAnalysis(false);
        }
    };

    // Download & Preprocess Log from GitHub Actions
    const fetchRunLog = async (id) => {
        setViewingLogId(id);
        setLoadingLog(true);
        setLogPreview("");
        try {
            const res = await api.get(`/logs/${id}`, getHeaders());
            setLogPreview(res.data.clean_log_preview || "No log content retrieved.");
        } catch (err) {
            setLogPreview(`Could not load log: ${err.message}. Ensure GitHub OAuth login is active.`);
        } finally {
            setLoadingLog(false);
        }
    };

    const copyFixText = (text) => {
        if (text) {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const getSeverityBadge = (severity) => {
        const sev = (severity || "").toLowerCase();
        if (sev === "high" || sev === "critical") {
            return (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/30 shadow-sm shadow-red-900/20">
                    <XCircle className="w-3.5 h-3.5" /> High Severity
                </span>
            );
        }
        if (sev === "medium") {
            return (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-sm shadow-amber-900/20">
                    <AlertTriangle className="w-3.5 h-3.5" /> Medium Severity
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm shadow-emerald-900/20">
                <CheckCircle2 className="w-3.5 h-3.5" /> Low Severity
            </span>
        );
    };

    // --- LANDING LOGIN PAGE IF NOT AUTHENTICATED ---
    if (!session && !githubToken) {
        return (
            <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 selection:bg-purple-500 selection:text-white">
                <div className="max-w-md w-full bg-slate-900/80 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="w-16 h-16 rounded-2xl bg-purple-900/40 border border-purple-500/30 text-purple-400 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-purple-950/50">
                        <Activity className="w-8 h-8" />
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
                        AI DevOps Assistant
                    </h1>
                    <p className="text-sm text-slate-400 mb-8 leading-relaxed">
                        Automated CI/CD Log Diagnostics, RAG Knowledge Retrieval, and IBM Granite LLM Incident Remediation.
                    </p>

                    <button
                        onClick={handleGitHubLogin}
                        className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-base shadow-xl shadow-purple-950/60 flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-98"
                    >
                        <Github className="w-5 h-5 fill-current" />
                        <span>Sign in with GitHub</span>
                    </button>

                    <div className="mt-8 pt-6 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-500">
                        <span>Supabase + GitHub OAuth</span>
                        <span>PostgreSQL DB Active</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-purple-500 selection:text-white">
            {/* Top Navigation Bar */}
            <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-purple-900/40 border border-purple-500/30 text-purple-400">
                            <Activity className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-white tracking-tight">AI DevOps Assistant</h1>
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] text-purple-300 font-mono flex items-center gap-1">
                                    <FolderGit2 className="w-3 h-3 text-purple-400" /> {owner} / {repo}
                                </span>
                                <button 
                                    onClick={() => setShowConfig(!showConfig)}
                                    className="text-[10px] text-slate-300 hover:text-white px-2 py-0.5 rounded bg-purple-950/80 border border-purple-500/40 flex items-center gap-1 transition-all"
                                >
                                    <ListFilter className="w-3 h-3 text-purple-400" /> Select Repo
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Right User Profile & Navigation Tabs */}
                    <div className="flex items-center gap-4">
                        <div className="flex gap-1 p-1 bg-slate-950/80 border border-slate-800 rounded-xl">
                            <button
                                onClick={() => setActiveTab("dashboard")}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                    activeTab === "dashboard" ? "bg-purple-600 text-white shadow-md" : "text-slate-400 hover:text-white"
                                }`}
                            >
                                Overview
                            </button>
                            <button
                                onClick={() => setActiveTab("analyze")}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                    activeTab === "analyze" ? "bg-purple-600 text-white shadow-md" : "text-slate-400 hover:text-white"
                                }`}
                            >
                                Custom Analyzer
                            </button>
                            <button
                                onClick={() => setActiveTab("incidents")}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                    activeTab === "incidents" ? "bg-purple-600 text-white shadow-md" : "text-slate-400 hover:text-white"
                                }`}
                            >
                                PostgreSQL Incidents ({incidents.length})
                            </button>
                        </div>

                        {/* Profile Avatar / Logout */}
                        <div className="flex items-center gap-2 border-l border-slate-800 pl-4">
                            {userProfile?.user_metadata?.avatar_url ? (
                                <img src={userProfile.user_metadata.avatar_url} alt="Profile" className="w-7 h-7 rounded-full border border-purple-500/40" />
                            ) : (
                                <User className="w-5 h-5 text-purple-400" />
                            )}
                            <button onClick={handleLogout} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all" title="Sign Out">
                                <LogOut className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Automatic Repository Selector Modal / Drawer */}
                {showConfig && (
                    <div className="bg-slate-900 border-b border-purple-500/30 p-6 animate-in slide-in-from-top duration-200 shadow-2xl">
                        <div className="max-w-7xl mx-auto space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                <div>
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                        <FolderGit2 className="w-4 h-4 text-purple-400" /> Select GitHub Repository
                                    </h3>
                                    <p className="text-xs text-slate-400 mt-0.5">Pick any repository from your authenticated GitHub account.</p>
                                </div>
                                <button onClick={() => setShowConfig(false)} className="text-xs text-slate-400 hover:text-white px-2 py-1 bg-slate-800 rounded">Close</button>
                            </div>

                            {/* Discovered Repository Cards */}
                            <div>
                                {loadingRepos ? (
                                    <p className="text-xs text-slate-400 italic py-2">Loading your GitHub repositories...</p>
                                ) : userRepos.length === 0 ? (
                                    <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-950 p-3 rounded-lg border border-slate-800">
                                        <span>Currently targetting: <strong className="text-purple-300">{owner}/{repo}</strong></span>
                                        <button 
                                            onClick={() => selectRepository(owner, repo)} 
                                            className="ml-auto px-3 py-1 rounded bg-purple-600 text-white font-medium text-xs"
                                        >
                                            Connect
                                        </button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
                                        {userRepos.map(r => (
                                            <button
                                                key={r.id}
                                                onClick={() => selectRepository(r.owner, r.name)}
                                                className={`p-2.5 rounded-lg border text-left transition-all text-xs flex items-center justify-between ${
                                                    r.name === repo && r.owner === owner 
                                                    ? "bg-purple-950/60 border-purple-500 text-purple-200 font-semibold" 
                                                    : "bg-slate-950/60 border-slate-800 hover:border-purple-500/40 text-slate-300 hover:bg-slate-900"
                                                }`}
                                            >
                                                <div className="truncate">
                                                    <p className="font-semibold text-slate-200 truncate">{r.name}</p>
                                                    <p className="text-[10px] text-slate-500 font-mono">{r.full_name}</p>
                                                </div>
                                                {r.is_private && <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 ml-2 shrink-0">Private</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </header>

            {/* Main Content Area */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
                
                {/* 1. AUTOMATED PIPELINE DASHBOARD TAB */}
                {activeTab === "dashboard" && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        {/* Status Cards Row */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-slate-900/70 border border-slate-800 p-5 rounded-2xl">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-mono text-slate-400 uppercase">Success Rate</span>
                                    <Activity className="w-4 h-4 text-emerald-400" />
                                </div>
                                <p className="text-3xl font-extrabold text-white">{metrics?.success_rate || "100%"}</p>
                                <p className="text-xs text-slate-500 mt-1">{metrics?.analyzed_runs || 0} total runs analyzed</p>
                            </div>

                            <div className="bg-slate-900/70 border border-slate-800 p-5 rounded-2xl">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-mono text-slate-400 uppercase">Deployment Risk</span>
                                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                                </div>
                                <p className="text-3xl font-extrabold text-amber-400">{risk?.risk_level || "Low Risk"}</p>
                                <p className="text-xs text-slate-500 mt-1">{risk?.recent_failures || 0} failures in last 10 builds</p>
                            </div>

                            <div className="bg-slate-900/70 border border-slate-800 p-5 rounded-2xl">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-mono text-slate-400 uppercase">LLM Engine</span>
                                    <Cpu className="w-4 h-4 text-purple-400" />
                                </div>
                                <p className="text-2xl font-bold text-purple-300">Granite 4:3b</p>
                                <p className="text-xs text-slate-500 mt-1">RAG Knowledge Base Active</p>
                            </div>

                            <div className="bg-slate-900/70 border border-slate-800 p-5 rounded-2xl">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-mono text-slate-400 uppercase">Persisted Incidents</span>
                                    <Database className="w-4 h-4 text-indigo-400" />
                                </div>
                                <p className="text-3xl font-extrabold text-indigo-300">{incidents.length}</p>
                                <p className="text-xs text-slate-500 mt-1">Stored in PostgreSQL DB</p>
                            </div>
                        </div>

                        {/* Automatic CI/CD Pipeline Runs & Direct AI Diagnoses */}
                        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-purple-400" /> Automated Pipeline AI Diagnoses ({owner}/{repo})
                                    </h2>
                                    <p className="text-xs text-slate-400 mt-0.5">Logs are automatically fetched from GitHub, preprocessed, passed to RAG + Granite AI, and displayed below.</p>
                                </div>
                                <button onClick={fetchDashboardData} className="text-xs text-slate-400 hover:text-white flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700">
                                    <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? "animate-spin" : ""}`} /> Refresh Pipeline
                                </button>
                            </div>

                            <div className="space-y-4">
                                {runs.length === 0 ? (
                                    <p className="text-xs text-slate-500 italic py-6 text-center">No GitHub Action runs retrieved for {owner}/{repo}.</p>
                                ) : (
                                    runs.map(run => {
                                        const isExpanded = expandedRunId === run.id;
                                        const ai = run.ai_analysis;
                                        return (
                                            <div key={run.id} className="rounded-xl bg-slate-950/70 border border-slate-800/90 overflow-hidden transition-all">
                                                {/* Header Bar */}
                                                <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`p-2 rounded-lg ${run.conclusion === "success" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                                                            {run.conclusion === "success" ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <h3 className="font-bold text-slate-100 text-sm">{run.name}</h3>
                                                                <span className="text-[11px] font-mono text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-500/30">
                                                                    #{run.id}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-slate-400 font-mono mt-0.5">
                                                                Branch: <span className="text-slate-300">{run.branch}</span> • {new Date(run.created_at).toLocaleTimeString()}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-3">
                                                        {ai && getSeverityBadge(ai.severity)}
                                                        <button
                                                            onClick={() => fetchRunLog(run.id)}
                                                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1"
                                                            title="View Preprocessed Log"
                                                        >
                                                            <Terminal className="w-3.5 h-3.5" /> Log Trace
                                                        </button>
                                                        <button
                                                            onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                                                            className="px-3 py-1.5 rounded-lg bg-purple-900/40 hover:bg-purple-900/80 border border-purple-500/30 text-purple-200 text-xs font-semibold flex items-center gap-1"
                                                        >
                                                            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                                                            <span>{isExpanded ? "Hide AI Diagnosis" : "View AI Diagnosis"}</span>
                                                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Automatic AI Diagnostic Card (Shown by Default or when Expanded) */}
                                                {(isExpanded || run.conclusion === "failure") && (
                                                    <div className="p-4 bg-slate-900/60 border-t border-slate-800/80 space-y-4 animate-in fade-in duration-200">
                                                        {ai ? (
                                                            <>
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                                                                        <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">Error Type</p>
                                                                        <p className="text-xs font-bold text-purple-300">{ai.error_type || "Build Trace Summary"}</p>
                                                                    </div>
                                                                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                                                                        <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">Root Cause</p>
                                                                        <p className="text-xs font-mono text-slate-300 truncate">{ai.root_cause}</p>
                                                                    </div>
                                                                </div>

                                                                <div>
                                                                    <div className="flex items-center justify-between mb-1.5">
                                                                        <p className="text-[11px] font-mono text-amber-400 uppercase tracking-wider flex items-center gap-1">
                                                                            <Lightbulb className="w-3.5 h-3.5 text-amber-400" /> Automated RAG + Granite Fix Recommendation
                                                                        </p>
                                                                        <button
                                                                            onClick={() => copyFixText(ai.recommended_fix)}
                                                                            className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800"
                                                                        >
                                                                            <Copy className="w-3 h-3" /> Copy Fix
                                                                        </button>
                                                                    </div>
                                                                    <div className="bg-amber-950/20 border border-amber-500/20 rounded-lg p-3 text-xs font-sans text-amber-200 leading-relaxed">
                                                                        {ai.recommended_fix || ai.suggestion}
                                                                    </div>
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <div className="p-4 text-center text-xs text-slate-400 italic">
                                                                Automatic log preprocessor & Granite AI analyzing run...
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. CUSTOM LOG ANALYZER TAB */}
                {activeTab === "analyze" && (
                    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
                        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl backdrop-blur-xl">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                        <Sparkles className="w-5 h-5 text-purple-400" /> RAG + IBM Granite AI Log Analyzer
                                    </h2>
                                    <p className="text-xs text-slate-400 mt-1">Upload CI/CD log files or paste trace output for root cause analysis.</p>
                                </div>
                                <div className="flex gap-2 p-1 bg-slate-950/70 border border-slate-800 rounded-xl">
                                    <button
                                        onClick={() => setInputMode("file")}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                            inputMode === "file" ? "bg-purple-600 text-white shadow" : "text-slate-400"
                                        }`}
                                    >
                                        File Upload
                                    </button>
                                    <button
                                        onClick={() => setInputMode("text")}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                            inputMode === "text" ? "bg-purple-600 text-white shadow" : "text-slate-400"
                                        }`}
                                    >
                                        Raw Trace
                                    </button>
                                </div>
                            </div>

                            {/* Dropzone or Textarea */}
                            {inputMode === "file" ? (
                                <div 
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                                        file ? "border-purple-500/60 bg-purple-950/20" : "border-slate-800 hover:border-purple-500/40 bg-slate-950/40"
                                    }`}
                                >
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={(e) => setFile(e.target.files[0])}
                                        className="hidden"
                                        accept=".log,.txt,.json,.trace"
                                    />
                                    <div className="p-3 rounded-full bg-purple-900/30 text-purple-400 border border-purple-500/20">
                                        <FileText className="w-6 h-6" />
                                    </div>
                                    {file ? (
                                        <div>
                                            <p className="font-semibold text-purple-300">{file.name}</p>
                                            <p className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB • Click to replace</p>
                                        </div>
                                    ) : (
                                        <div>
                                            <p className="text-sm font-medium text-slate-300">Click to select log file or drag & drop</p>
                                            <p className="text-xs text-slate-500 mt-1">Supports .log, .txt, .json, .trace files</p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <textarea
                                    rows={7}
                                    value={logText}
                                    onChange={(e) => setLogText(e.target.value)}
                                    placeholder="Paste build trace, exception stack trace, or server logs..."
                                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/60 transition-all resize-none"
                                />
                            )}

                            {errorMsg && (
                                <div className="mt-4 p-3 rounded-xl bg-red-950/50 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                                    <span>{errorMsg}</span>
                                </div>
                            )}

                            <div className="mt-6 flex justify-end">
                                <button
                                    onClick={() => runAIAnalysis()}
                                    disabled={loadingAnalysis}
                                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-purple-950/50 flex items-center gap-2 disabled:opacity-50"
                                >
                                    {loadingAnalysis ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                            <span>Running RAG + Granite AI...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Cpu className="w-4 h-4" />
                                            <span>Analyze Custom Trace</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Analysis Result */}
                            {analysisResult && (
                                <div className="mt-8 pt-8 border-t border-slate-800/80 space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                            <Sparkles className="w-5 h-5 text-purple-400" /> Diagnostic Result
                                        </h3>
                                        {getSeverityBadge(analysisResult.severity)}
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
                                            <p className="text-xs font-mono text-slate-500 uppercase mb-1">Status</p>
                                            <p className="text-sm font-semibold text-slate-200 capitalize">{analysisResult.status}</p>
                                        </div>
                                        <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
                                            <p className="text-xs font-mono text-slate-500 uppercase mb-1">Error Classification</p>
                                            <p className="text-sm font-semibold text-purple-300">{analysisResult.error_type}</p>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="text-xs font-mono text-slate-400 uppercase mb-2">Root Cause</h4>
                                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-300">
                                            {analysisResult.root_cause}
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="text-xs font-mono text-slate-400 uppercase mb-2">Detailed Explanation</h4>
                                        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 leading-relaxed">
                                            {analysisResult.explanation || analysisResult.root_cause}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="text-xs font-mono text-amber-400 uppercase flex items-center gap-1.5">
                                                <Lightbulb className="w-3.5 h-3.5 text-amber-400" /> Recommended Fix Action
                                            </h4>
                                            <button
                                                onClick={() => copyFixText(analysisResult.recommended_fix || analysisResult.suggestion)}
                                                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 px-2 py-1 rounded bg-slate-800"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                                <span>Copy Fix</span>
                                            </button>
                                        </div>
                                        <div className="bg-amber-950/20 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-200 leading-relaxed">
                                            {analysisResult.recommended_fix || analysisResult.suggestion}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 3. POSTGRESQL INCIDENTS TAB */}
                {activeTab === "incidents" && (
                    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl animate-in fade-in duration-300">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Database className="w-5 h-5 text-indigo-400" /> Persisted Incident History
                                </h2>
                                <p className="text-xs text-slate-400 mt-0.5">Stored automatically in PostgreSQL / Supabase database for compliance & post-mortems.</p>
                            </div>
                        </div>

                        {incidents.length === 0 ? (
                            <p className="text-xs text-slate-500 italic text-center py-8">No incident records currently in database.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs text-slate-300">
                                    <thead className="bg-slate-950 text-slate-400 uppercase font-mono border-b border-slate-800">
                                        <tr>
                                            <th className="p-3">Run ID</th>
                                            <th className="p-3">Repo</th>
                                            <th className="p-3">Error Type</th>
                                            <th className="p-3">Severity</th>
                                            <th className="p-3">Root Cause</th>
                                            <th className="p-3">Logged At</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60">
                                        {incidents.map(inc => (
                                            <tr key={inc.id} className="hover:bg-slate-950/40">
                                                <td className="p-3 font-mono text-purple-300">{inc.run_id}</td>
                                                <td className="p-3 font-mono text-slate-400">{inc.repo || `${owner}/${repo}`}</td>
                                                <td className="p-3 font-semibold">{inc.error_type}</td>
                                                <td className="p-3">{getSeverityBadge(inc.severity)}</td>
                                                <td className="p-3 truncate max-w-xs">{inc.root_cause}</td>
                                                <td className="p-3 text-slate-500 font-mono text-[11px]">{new Date(inc.created_at).toLocaleTimeString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Log Viewer Modal */}
            {viewingLogId && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
                        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
                                <Terminal className="w-4 h-4 text-purple-400" /> Preprocessed Log Trace — Run #{viewingLogId} ({owner}/{repo})
                            </h3>
                            <button onClick={() => setViewingLogId(null)} className="text-xs text-slate-400 hover:text-white px-2 py-1 bg-slate-800 rounded">Close</button>
                        </div>
                        <div className="p-4 flex-1 overflow-y-auto bg-slate-950 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                            {loadingLog ? "Downloading and preprocessing GitHub Actions ZIP log..." : logPreview}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Dashboard;