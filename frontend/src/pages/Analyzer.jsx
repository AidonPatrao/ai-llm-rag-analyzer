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
    FolderGit2
} from "lucide-react";
import api from "../services/api";

function Dashboard() {
    // Repository & Account Configuration State
    const [owner, setOwner] = useState(() => localStorage.getItem("gh_owner") || "AidonPatrao");
    const [repo, setRepo] = useState(() => localStorage.getItem("gh_repo") || "ai-llm-rag-analyzer");
    const [pat, setPat] = useState(() => localStorage.getItem("gh_pat") || "");
    const [showConfig, setShowConfig] = useState(false);

    // Navigation state
    const [activeTab, setActiveTab] = useState("dashboard"); // 'dashboard', 'analyze', 'incidents'
    const [file, setFile] = useState(null);
    const [logText, setLogText] = useState("");
    const [inputMode, setInputMode] = useState("file"); // 'file' or 'text'
    
    // Data states from backend
    const [metrics, setMetrics] = useState(null);
    const [risk, setRisk] = useState(null);
    const [runs, setRuns] = useState([]);
    const [failedBuilds, setFailedBuilds] = useState([]);
    const [incidents, setIncidents] = useState([]);
    
    // Analysis state
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

    // Save configuration settings
    const saveConfig = (newOwner, newRepo, newPat) => {
        setOwner(newOwner);
        setRepo(newRepo);
        setPat(newPat);
        localStorage.setItem("gh_owner", newOwner);
        localStorage.setItem("gh_repo", newRepo);
        localStorage.setItem("gh_pat", newPat);
        setShowConfig(false);
    };

    // Helper for API headers
    const getHeaders = () => ({
        headers: {
            "x-github-owner": owner,
            "x-github-repo": repo,
            "x-github-pat": pat
        }
    });

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
    }, [owner, repo, pat]);

    // Analyze Log (RAG + Granite LLM)
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
            setLogPreview(`Could not load log: ${err.message}. Ensure GitHub PAT token is configured.`);
        } finally {
            setLoadingLog(false);
        }
    };

    const copyFix = () => {
        if (analysisResult?.recommended_fix) {
            navigator.clipboard.writeText(analysisResult.recommended_fix);
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
                                    className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 flex items-center gap-1 transition-all"
                                >
                                    <Settings className="w-3 h-3" /> Select Repo
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Navigation Tabs */}
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
                            AI Log Analyzer
                        </button>
                        <button
                            onClick={() => setActiveTab("incidents")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                activeTab === "incidents" ? "bg-purple-600 text-white shadow-md" : "text-slate-400 hover:text-white"
                            }`}
                        >
                            Incident DB ({incidents.length})
                        </button>
                    </div>
                </div>

                {/* Repository Configuration Modal / Drawer */}
                {showConfig && (
                    <div className="bg-slate-900 border-b border-purple-500/30 p-4 animate-in slide-in-from-top duration-200">
                        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                            <div>
                                <label className="block text-xs font-mono text-slate-400 mb-1">GitHub Username / Owner</label>
                                <input
                                    type="text"
                                    value={owner}
                                    onChange={(e) => setOwner(e.target.value)}
                                    placeholder="e.g. AidonPatrao"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-slate-400 mb-1">Repository Name</label>
                                <input
                                    type="text"
                                    value={repo}
                                    onChange={(e) => setRepo(e.target.value)}
                                    placeholder="e.g. ai-llm-rag-analyzer"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                                />
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="block text-xs font-mono text-slate-400 mb-1">GitHub PAT Token (Optional)</label>
                                    <input
                                        type="password"
                                        value={pat}
                                        onChange={(e) => setPat(e.target.value)}
                                        placeholder="ghp_..."
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                                    />
                                </div>
                                <button
                                    onClick={() => saveConfig(owner, repo, pat)}
                                    className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs shadow"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </header>

            {/* Main Content Area */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
                
                {/* 1. OVERVIEW DASHBOARD TAB */}
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

                        {/* Recent Workflow Runs & Failed Builds */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Workflow Runs List */}
                            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                                        <GitBranch className="w-4 h-4 text-purple-400" /> Recent Runs ({owner}/{repo})
                                    </h2>
                                    <button onClick={fetchDashboardData} className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
                                        <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? "animate-spin" : ""}`} /> Refresh
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    {runs.length === 0 ? (
                                        <p className="text-xs text-slate-500 italic py-4">No GitHub Action runs retrieved for {owner}/{repo}.</p>
                                    ) : (
                                        runs.map(run => (
                                            <div key={run.id} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs">
                                                <div>
                                                    <p className="font-semibold text-slate-200">{run.name}</p>
                                                    <p className="text-slate-500 font-mono text-[11px] mt-0.5">#{run.id} • {run.branch}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {run.conclusion === "success" ? (
                                                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[11px]">Success</span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/30 text-[11px]">Failed</span>
                                                    )}
                                                    <button onClick={() => fetchRunLog(run.id)} className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">
                                                        <Terminal className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Failed Builds & Fast Diagnose */}
                            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
                                <h2 className="text-base font-bold text-white flex items-center gap-2 mb-4">
                                    <AlertTriangle className="w-4 h-4 text-amber-400" /> Failed Builds Diagnostics
                                </h2>
                                <div className="space-y-3">
                                    {failedBuilds.length === 0 ? (
                                        <div className="p-6 text-center border border-dashed border-slate-800 rounded-xl">
                                            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                                            <p className="text-xs text-slate-400 font-medium">No active build failures in repository {owner}/{repo}.</p>
                                        </div>
                                    ) : (
                                        failedBuilds.map(fb => (
                                            <div key={fb.id} className="p-3.5 rounded-xl bg-red-950/20 border border-red-500/20 flex items-center justify-between text-xs">
                                                <div>
                                                    <p className="font-semibold text-red-200">{fb.name}</p>
                                                    <p className="text-slate-500 font-mono text-[11px]">ID: {fb.id} • Branch: {fb.branch}</p>
                                                </div>
                                                <button 
                                                    onClick={() => {
                                                        setActiveTab("analyze");
                                                        runAIAnalysis(null, fb.id);
                                                    }}
                                                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium shadow flex items-center gap-1.5 text-xs"
                                                >
                                                    <Sparkles className="w-3.5 h-3.5" /> Run AI Diagnosis
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. AI LOG ANALYZER TAB */}
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
                                            <span>Analyze Log Trace</span>
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
                                                onClick={copyFix}
                                                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 px-2 py-1 rounded bg-slate-800"
                                            >
                                                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                                <span>{copied ? "Copied" : "Copy Fix"}</span>
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

                {/* 3. INCIDENT HISTORY TAB */}
                {activeTab === "incidents" && (
                    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl animate-in fade-in duration-300">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Database className="w-5 h-5 text-indigo-400" /> Persisted Incident History
                                </h2>
                                <p className="text-xs text-slate-400 mt-0.5">Stored automatically in PostgreSQL database for compliance & post-mortems.</p>
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