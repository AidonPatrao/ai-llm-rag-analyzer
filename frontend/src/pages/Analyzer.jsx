import { useState, useRef } from "react";
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
    Sparkles 
} from "lucide-react";
import api from "../services/api";

function Analyzer() {
    const [file, setFile] = useState(null);
    const [logText, setLogText] = useState("");
    const [activeTab, setActiveTab] = useState("file"); // 'file' or 'text'
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [copied, setCopied] = useState(false);
    const fileInputRef = useRef(null);

    async function analyzeLog() {
        if (activeTab === "file" && !file) {
            setErrorMsg("Please select or drop a log file first.");
            return;
        }
        if (activeTab === "text" && !logText.trim()) {
            setErrorMsg("Please paste or type your log trace content.");
            return;
        }

        setErrorMsg("");
        setLoading(true);
        setResult(null);

        try {
            let res;
            if (activeTab === "file" && file) {
                const formData = new FormData();
                formData.append("file", file);
                res = await api.post("/analyze", formData, {
                    headers: { "Content-Type": "multipart/form-data" }
                });
            } else {
                res = await api.post("/analyze", { log: logText });
            }

            setResult(res.data);
        } catch (err) {
            console.error("Analysis Error:", err);
            setErrorMsg(err.response?.data?.root_cause || err.message || "Failed to reach AI log analyzer service.");
        } finally {
            setLoading(false);
        }
    }

    const copySuggestion = () => {
        if (result?.suggestion) {
            navigator.clipboard.writeText(result.suggestion);
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
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 md:p-8 font-sans selection:bg-purple-500 selection:text-white">
            {/* Header / Brand */}
            <div className="max-w-4xl w-full mb-8 text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-950/60 border border-purple-500/30 text-purple-300 text-xs font-mono mb-4 backdrop-blur-md shadow-lg">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                    <span>LLM Engine: Ollama granite4:3b</span>
                </div>
                <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-purple-400 bg-clip-text text-transparent mb-3">
                    DevOps AI Log Analyzer
                </h1>
                <p className="text-slate-400 text-base md:text-lg max-w-2xl mx-auto">
                    Instant root cause analysis and actionable remediation suggestions powered by local RAG & LLM models.
                </p>
            </div>

            {/* Main Card */}
            <div className="max-w-4xl w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl backdrop-blur-xl transition-all">
                {/* Tabs */}
                <div className="flex gap-2 p-1 bg-slate-950/70 border border-slate-800/80 rounded-xl mb-6 max-w-xs">
                    <button
                        onClick={() => setActiveTab("file")}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                            activeTab === "file" 
                            ? "bg-purple-600 text-white shadow-md shadow-purple-900/30" 
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                        }`}
                    >
                        <Upload className="w-4 h-4" /> File Upload
                    </button>
                    <button
                        onClick={() => setActiveTab("text")}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                            activeTab === "text" 
                            ? "bg-purple-600 text-white shadow-md shadow-purple-900/30" 
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                        }`}
                    >
                        <Terminal className="w-4 h-4" /> Raw Trace
                    </button>
                </div>

                {/* File Upload Zone */}
                {activeTab === "file" ? (
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                            file 
                            ? "border-purple-500/60 bg-purple-950/20" 
                            : "border-slate-800 hover:border-purple-500/40 bg-slate-950/40 hover:bg-slate-950/80"
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
                    /* Raw Textarea input */
                    <div className="relative">
                        <textarea
                            rows={7}
                            value={logText}
                            onChange={(e) => setLogText(e.target.value)}
                            placeholder="Paste build trace, exception logs, or runtime stack traces here..."
                            className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30 transition-all resize-none"
                        />
                    </div>
                )}

                {/* Error Banner */}
                {errorMsg && (
                    <div className="mt-4 p-3 rounded-xl bg-red-950/50 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                        <span>{errorMsg}</span>
                    </div>
                )}

                {/* Submit Action */}
                <div className="mt-6 flex justify-end">
                    <button
                        onClick={analyzeLog}
                        disabled={loading}
                        className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-98 text-white font-semibold text-sm shadow-lg shadow-purple-950/50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                <span>Analyzing Trace...</span>
                            </>
                        ) : (
                            <>
                                <Cpu className="w-4 h-4" />
                                <span>Analyze Log Trace</span>
                            </>
                        )}
                    </button>
                </div>

                {/* Analysis Result Card */}
                {result && (
                    <div className="mt-8 pt-8 border-t border-slate-800/80 animate-in fade-in slide-in-from-bottom-3 duration-300">
                        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Sparkles className="w-5 h-5 text-purple-400" /> AI Diagnostic Result
                                </h2>
                            </div>
                            <div className="flex items-center gap-2">
                                {getSeverityBadge(result.severity)}
                            </div>
                        </div>

                        {/* Overview Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                            <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl">
                                <p className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-1">Status</p>
                                <p className="text-sm font-semibold text-slate-200 capitalize flex items-center gap-1.5">
                                    {result.status === "failed" ? (
                                        <XCircle className="w-4 h-4 text-red-400" />
                                    ) : (
                                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                    )}
                                    {result.status}
                                </p>
                            </div>

                            <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl">
                                <p className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-1">Error Type</p>
                                <p className="text-sm font-semibold text-purple-300">
                                    {result.error_type || "Unclassified Error"}
                                </p>
                            </div>
                        </div>

                        {/* Root Cause */}
                        <div className="mb-6">
                            <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <Terminal className="w-3.5 h-3.5 text-slate-400" /> Detected Root Cause
                            </h3>
                            <div className="bg-slate-950 border border-slate-800/90 rounded-xl p-4 text-xs font-mono text-slate-300 leading-relaxed overflow-x-auto">
                                {result.root_cause}
                            </div>
                        </div>

                        {/* Suggestion & Remediation */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-xs font-mono text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Lightbulb className="w-3.5 h-3.5 text-amber-400" /> Actionable Fix Suggestion
                                </h3>
                                <button
                                    onClick={copySuggestion}
                                    className="text-xs text-slate-400 hover:text-white flex items-center gap-1 px-2 py-1 rounded bg-slate-800/50 hover:bg-slate-800 transition-all"
                                >
                                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                    <span>{copied ? "Copied" : "Copy Fix"}</span>
                                </button>
                            </div>
                            <div className="bg-amber-950/15 border border-amber-500/20 rounded-xl p-4 text-xs font-sans text-amber-200/90 leading-relaxed">
                                {result.suggestion}
                            </div>
                        </div>

                        {/* Engine Metadata */}
                        {result.analyzed_by && (
                            <div className="mt-4 text-right text-[11px] font-mono text-slate-500">
                                Powered by: <span className="text-slate-400">{result.analyzed_by}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default Analyzer;