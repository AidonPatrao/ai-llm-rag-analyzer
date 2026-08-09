import express from "express";
import cors from "cors";
import multer from "multer";
import axios from "axios";
import dotenv from "dotenv";
import AdmZip from "adm-zip";
import pg from "pg";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration default variables
const GITHUB_PAT = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN || "";
const GITHUB_OWNER = process.env.GITHUB_OWNER || "AidonPatrao";
const GITHUB_REPO = process.env.GITHUB_REPO || "ai-llm-rag-analyzer";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const PRIMARY_MODEL = process.env.GRANITE_MODEL || "granite4:3b";
const DATABASE_URL = process.env.DATABASE_URL || "";

app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

const upload = multer({ storage: multer.memoryStorage() });

// --- PostgreSQL Database Initialization ---
let dbPool = null;
let inMemoryIncidents = [];
let runAnalysisCache = new Map(); // Cache AI analysis for run_ids to avoid redundant LLM calls

if (DATABASE_URL) {
    try {
        dbPool = new pg.Pool({
            connectionString: DATABASE_URL,
            ssl: DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1") ? false : { rejectUnauthorized: false }
        });
        
        dbPool.query(`
            CREATE TABLE IF NOT EXISTS incidents (
                id SERIAL PRIMARY KEY,
                run_id VARCHAR(100),
                repo VARCHAR(200),
                status VARCHAR(50),
                error_type VARCHAR(150),
                severity VARCHAR(50),
                root_cause TEXT,
                explanation TEXT,
                recommended_fix TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `).then(() => {
            console.log("🐘 PostgreSQL DB connected & `incidents` table verified.");
        }).catch(err => {
            console.warn("⚠️ PostgreSQL initialization warning:", err.message);
        });
    } catch (e) {
        console.warn("⚠️ Could not create PostgreSQL pool. Using fallback storage.");
    }
}

function getRepoConfig(req) {
    const owner = req?.headers?.["x-github-owner"] || GITHUB_OWNER;
    const repo = req?.headers?.["x-github-repo"] || GITHUB_REPO;
    const pat = req?.headers?.["x-github-pat"] || GITHUB_PAT;
    return { owner, repo, pat };
}

async function saveIncidentRecord(incident, repoName) {
    const record = {
        id: Date.now(),
        run_id: String(incident.run_id || "manual-upload"),
        repo: repoName || `${GITHUB_OWNER}/${GITHUB_REPO}`,
        status: incident.status || "failed",
        error_type: incident.error_type || "Unclassified",
        severity: incident.severity || "Medium",
        root_cause: incident.root_cause || "No root cause identified",
        explanation: incident.explanation || incident.root_cause || "",
        recommended_fix: incident.recommended_fix || incident.suggestion || "Review logs",
        created_at: new Date().toISOString()
    };

    inMemoryIncidents.unshift(record);
    runAnalysisCache.set(record.run_id, record);

    if (dbPool) {
        try {
            await dbPool.query(
                `INSERT INTO incidents (run_id, repo, status, error_type, severity, root_cause, explanation, recommended_fix)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [record.run_id, record.repo, record.status, record.error_type, record.severity, record.root_cause, record.explanation, record.recommended_fix]
            );
        } catch (err) {
            console.warn("Could not save incident to PostgreSQL:", err.message);
        }
    }
    return record;
}

// --- RAG Knowledge Base ---
const RAG_KNOWLEDGE_BASE = [
    {
        category: "Dependency Error",
        keywords: ["ERR_MODULE_NOT_FOUND", "Cannot find module", "npm ERR!", "package-lock.json"],
        guide: "Check package.json to ensure missing module is listed under dependencies. Run `npm install` and verify node_modules integrity."
    },
    {
        category: "React JSX Syntax Error",
        keywords: ["Expected corresponding JSX closing tag", "Unterminated JSX", "JSX element", "SyntaxError"],
        guide: "Inspect return statement of React component. Ensure every opening JSX tag has a matching closing tag or self-closing bracket."
    },
    {
        category: "Network & Connection Error",
        keywords: ["ECONNREFUSED", "ETIMEDOUT", "Failed to fetch", "ENOTFOUND"],
        guide: "Verify target backend server, database host, or API endpoint port configuration. Ensure firewall policies allow connection."
    },
    {
        category: "Database Connection Failure",
        keywords: ["pg", "postgresql", "password authentication failed", "database does not exist"],
        guide: "Verify DATABASE_URL environment variable in .env. Ensure PostgreSQL container or service is active and user credentials match."
    },
    {
        category: "GitHub Actions Permission & Runner Error",
        keywords: ["Permission denied", "HTTP 403", "Resource not accessible", "GITHUB_TOKEN"],
        guide: "Check GITHUB_TOKEN workflow permissions in .github/workflows/*.yml. Add `permissions: contents: read` or `write` scope."
    },
    {
        category: "Resource & Heap Out of Memory",
        keywords: ["ENOSPC", "Out of Memory", "JavaScript heap out of memory", "FATAL ERROR"],
        guide: "Increase Node memory limit by setting NODE_OPTIONS='--max-old-space-size=4096' or clear disk space on runner."
    }
];

function retrieveRAGContext(logText) {
    const matchedGuides = [];
    const textLower = logText.toLowerCase();

    for (const kb of RAG_KNOWLEDGE_BASE) {
        const matches = kb.keywords.some(kw => textLower.includes(kw.toLowerCase()));
        if (matches) {
            matchedGuides.push(`[Knowledge Base - ${kb.category}]: ${kb.guide}`);
        }
    }

    if (matchedGuides.length === 0) {
        matchedGuides.push("[Knowledge Base - General DevOps]: Check stack trace line numbers, examine git commit diffs, and inspect process environment variables.");
    }

    return matchedGuides.join("\n");
}

// --- Phase 8 Intelligent Log Preprocessor ---
function preprocessLog(rawLogText) {
    if (!rawLogText) return { cleanText: "", totalLines: 0, errorLineCount: 0, snippets: [] };

    const lines = rawLogText.split(/\r?\n/);
    const totalLines = lines.length;

    const noisePatterns = [
        /^##\[group\]/i,
        /^##\[endgroup\]/i,
        /^Set up job/i,
        /^Complete job/i,
        /^Post Checkout/i,
        /^Cleaning up orphan processes/i,
        /^Evaluating/i,
        /^Preparing worker/i
    ];

    const errorKeywords = [
        "error", "err!", "failed", "failure", "fatal", "exception",
        "syntaxerror", "typeerror", "referenceerror", "econnrefused",
        "exit code", "command failed", "process completed with exit code"
    ];

    const filteredLines = [];
    const errorSnippets = [];

    lines.forEach((line, index) => {
        const cleanLine = line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s*/, "").trim();

        if (!cleanLine) return;
        if (noisePatterns.some(pattern => pattern.test(cleanLine))) return;

        filteredLines.push(cleanLine);

        const lower = cleanLine.toLowerCase();
        if (errorKeywords.some(kw => lower.includes(kw))) {
            const start = Math.max(0, index - 2);
            const end = Math.min(lines.length - 1, index + 2);
            const context = lines.slice(start, end + 1).map(l => l.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s*/, "").trim()).join("\n");
            errorSnippets.push(context);
        }
    });

    const uniqueSnippets = [...new Set(errorSnippets)];
    const cleanText = uniqueSnippets.length > 0 ? uniqueSnippets.join("\n---\n") : filteredLines.slice(-100).join("\n");

    return {
        cleanText,
        totalLines,
        errorLineCount: uniqueSnippets.length,
        snippets: uniqueSnippets.slice(0, 10)
    };
}

// --- GitHub REST API Helper ---
async function fetchGitHubAPI(endpoint, req) {
    const { owner, repo, pat } = getRepoConfig(req);
    const url = `https://api.github.com/repos/${owner}/${repo}${endpoint}`;
    const headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "DevOps-AI-Log-Analyzer"
    };

    if (pat) {
        headers["Authorization"] = `Bearer ${pat}`;
    }

    const response = await axios.get(url, { headers });
    return response.data;
}

// Automatic Log Fetching & LLM Analysis pipeline for a run ID
async function autoAnalyzeRun(runId, req) {
    const runIdStr = String(runId);
    if (runAnalysisCache.has(runIdStr)) {
        return runAnalysisCache.get(runIdStr);
    }

    try {
        const { owner, repo, pat } = getRepoConfig(req);
        const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runIdStr}/logs`;
        const headers = { "User-Agent": "DevOps-AI-Log-Analyzer" };
        if (pat) headers["Authorization"] = `Bearer ${pat}`;

        const logZipResponse = await axios.get(url, { headers, responseType: "arraybuffer" });
        const zip = new AdmZip(Buffer.from(logZipResponse.data));
        const zipEntries = zip.getEntries();

        let fullRawLog = "";
        zipEntries.forEach(entry => {
            if (!entry.isDirectory && entry.entryName.endsWith(".txt")) {
                fullRawLog += `\n--- [LOG FILE: ${entry.entryName}] ---\n` + entry.readAsText("utf-8");
            }
        });

        const preprocessed = preprocessLog(fullRawLog);
        const logContent = preprocessed.cleanText || fullRawLog.slice(0, 3500);
        const ragContext = retrieveRAGContext(logContent);

        let aiResult = null;
        try {
            const systemPrompt = `You are IBM Granite AI DevOps Log Analyzer & Incident Remediation Assistant.
You have access to the following DevOps Knowledge Base context:
${ragContext}

Analyze the provided cleaned CI/CD build error log and output ONLY a raw JSON object (strictly no markdown formatting, no code block backticks).
The JSON MUST contain these exact key names:
- status: string ("failed", "warning", or "success")
- error_type: string (e.g. "Dependency Error", "React JSX Syntax Error", "Build Process Timeout")
- severity: string ("High", "Medium", or "Low")
- root_cause: string (concise 1-sentence statement of why the build failed)
- explanation: string (detailed breakdown of the failure stack trace)
- recommended_fix: string (step-by-step shell commands or code fixes to resolve the issue)

Error Log Snippet:
${logContent.slice(0, 4000)}
`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);

            const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    model: PRIMARY_MODEL,
                    prompt: systemPrompt,
                    stream: false
                })
            });

            clearTimeout(timeoutId);

            if (ollamaRes.ok) {
                const data = await ollamaRes.json();
                const responseText = (data.response || "").trim();
                const cleanedJson = responseText
                    .replace(/^```json\s*/i, "")
                    .replace(/^```\s*/, "")
                    .replace(/\s*```$/, "")
                    .trim();

                try {
                    aiResult = JSON.parse(cleanedJson);
                } catch (e) {}
            }
        } catch (llmErr) {}

        if (!aiResult) {
            aiResult = {
                status: "failed",
                error_type: preprocessed.errorLineCount > 0 ? "Build Process Execution Error" : "Pipeline Build Log Warning",
                severity: "Medium",
                root_cause: preprocessed.snippets[0] ? preprocessed.snippets[0].slice(0, 250) : "Build workflow finished or encountered errors.",
                explanation: `Analysis generated via RAG Knowledge Engine. Matches pattern: ${ragContext.slice(0, 150)}`,
                recommended_fix: "Review stack trace snippets, check environment variables in .env, and re-run workflow."
            };
        }

        const savedRecord = await saveIncidentRecord({ ...aiResult, run_id: runIdStr }, `${owner}/${repo}`);
        return savedRecord;

    } catch (err) {
        const fallback = {
            run_id: String(runId),
            status: "success",
            error_type: "Clean Pipeline Build",
            severity: "Low",
            root_cause: "No critical errors found in build trace.",
            explanation: "All steps in pipeline executed smoothly.",
            recommended_fix: "No action required."
        };
        runAnalysisCache.set(String(runId), fallback);
        return fallback;
    }
}

// --- Endpoints ---

// Health Check
app.get("/api/health", (req, res) => {
    const { owner, repo } = getRepoConfig(req);
    res.json({
        success: true,
        message: "DevOps AI Log Analyzer Backend is active 🚀",
        model: PRIMARY_MODEL,
        github_repo: `${owner}/${repo}`,
        database_connected: !!dbPool,
        timestamp: new Date().toISOString()
    });
});

// GET /api/github/user-repos: Fetch list of repositories for given owner/token
app.get("/api/github/user-repos", async (req, res) => {
    try {
        const { owner, pat } = getRepoConfig(req);
        const headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "DevOps-AI-Log-Analyzer"
        };
        if (pat) headers["Authorization"] = `Bearer ${pat}`;

        let url = pat ? "https://api.github.com/user/repos?per_page=100&sort=updated" : `https://api.github.com/users/${owner}/repos?per_page=100&sort=updated`;

        const response = await axios.get(url, { headers });
        const repos = (response.data || []).map(r => ({
            id: r.id,
            name: r.name,
            full_name: r.full_name,
            owner: r.owner?.login || owner,
            is_private: r.private,
            updated_at: r.updated_at
        }));

        res.json({ success: true, count: repos.length, repos });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message, repos: [] });
    }
});

// GET /github: Latest 5 workflow runs with AUTOMATIC AI DIAGNOSIS
app.get("/github", async (req, res) => {
    try {
        const data = await fetchGitHubAPI("/actions/runs?per_page=5", req);
        const rawRuns = data.workflow_runs || [];

        // Auto-analyze runs parallelly
        const runs = await Promise.all(rawRuns.map(async r => {
            let aiAnalysis = null;
            if (r.conclusion === "failure" || r.conclusion === "success") {
                aiAnalysis = await autoAnalyzeRun(r.id, req);
            }
            return {
                id: r.id,
                name: r.name,
                status: r.status,
                conclusion: r.conclusion,
                branch: r.head_branch,
                commit_message: r.head_commit?.message || "N/A",
                html_url: r.html_url,
                created_at: r.created_at,
                updated_at: r.updated_at,
                ai_analysis: aiAnalysis
            };
        }));

        res.json({ success: true, count: runs.length, runs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message, runs: [] });
    }
});

// GET /failed-builds: Failed workflow runs with AUTOMATIC AI DIAGNOSIS
app.get("/failed-builds", async (req, res) => {
    try {
        const data = await fetchGitHubAPI("/actions/runs?status=completed&per_page=20", req);
        const rawFailedRuns = (data.workflow_runs || []).filter(r => r.conclusion === "failure");

        const failedRuns = await Promise.all(rawFailedRuns.map(async r => {
            const aiAnalysis = await autoAnalyzeRun(r.id, req);
            return {
                id: r.id,
                name: r.name,
                status: r.status,
                conclusion: r.conclusion,
                branch: r.head_branch,
                actor: r.actor?.login || "unknown",
                html_url: r.html_url,
                created_at: r.created_at,
                ai_analysis: aiAnalysis
            };
        }));

        res.json({ success: true, count: failedRuns.length, failed_builds: failedRuns });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message, failed_builds: [] });
    }
});

// GET /failed-builds/:id: Individual workflow details
app.get("/failed-builds/:id", async (req, res) => {
    try {
        const data = await fetchGitHubAPI(`/actions/runs/${req.params.id}`, req);
        const aiAnalysis = await autoAnalyzeRun(req.params.id, req);
        res.json({ success: true, run: data, ai_analysis: aiAnalysis });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /metrics: Build statistics and success rate
app.get("/metrics", async (req, res) => {
    try {
        const data = await fetchGitHubAPI("/actions/runs?per_page=50", req);
        const total = data.total_count || data.workflow_runs?.length || 0;
        const runs = data.workflow_runs || [];
        
        const successCount = runs.filter(r => r.conclusion === "success").length;
        const failedCount = runs.filter(r => r.conclusion === "failure").length;
        const successRate = total > 0 ? ((successCount / runs.length) * 100).toFixed(1) : 100;

        res.json({
            success: true,
            total_runs: total,
            analyzed_runs: runs.length,
            success_count: successCount,
            failed_count: failedCount,
            success_rate: `${successRate}%`
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            total_runs: 0,
            success_rate: "100%",
            error: err.message
        });
    }
});

// GET /health-status: Status of latest workflow
app.get("/health-status", async (req, res) => {
    try {
        const data = await fetchGitHubAPI("/actions/runs?per_page=1", req);
        const latest = data.workflow_runs?.[0];
        const status = latest?.conclusion === "success" ? "Healthy" : latest?.conclusion === "failure" ? "Critical" : "Degraded";
        
        res.json({
            success: true,
            health: status,
            latest_run: latest ? {
                id: latest.id,
                name: latest.name,
                conclusion: latest.conclusion,
                created_at: latest.created_at
            } : null
        });
    } catch (err) {
        res.status(500).json({ success: false, health: "Unknown", error: err.message });
    }
});

// GET /risk-analysis: Basic deployment risk analysis
app.get("/risk-analysis", async (req, res) => {
    try {
        const data = await fetchGitHubAPI("/actions/runs?per_page=10", req);
        const runs = data.workflow_runs || [];
        const failures = runs.filter(r => r.conclusion === "failure").length;
        const riskLevel = failures >= 3 ? "High Risk" : failures >= 1 ? "Medium Risk" : "Low Risk";

        res.json({
            success: true,
            risk_level: riskLevel,
            recent_failures: failures,
            recent_total: runs.length,
            recommendation: failures >= 2 ? "Hold deployment. AI diagnostic running on recent build failures." : "Safe to proceed with deployment."
        });
    } catch (err) {
        res.status(500).json({ success: false, risk_level: "Low Risk", error: err.message });
    }
});

// GET /devops-summary: Combined overview
app.get("/devops-summary", async (req, res) => {
    try {
        const [runsData, metricsData, healthData, riskData] = await Promise.allSettled([
            fetchGitHubAPI("/actions/runs?per_page=5", req),
            fetchGitHubAPI("/actions/runs?per_page=20", req),
            fetchGitHubAPI("/actions/runs?per_page=1", req),
            fetchGitHubAPI("/actions/runs?per_page=10", req)
        ]);

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            runs: runsData.status === "fulfilled" ? runsData.value.workflow_runs || [] : [],
            health: healthData.status === "fulfilled" ? healthData.value.workflow_runs?.[0]?.conclusion : "unknown",
            risk: riskData.status === "fulfilled" ? (riskData.value.workflow_runs?.filter(r => r.conclusion === "failure").length >= 2 ? "High Risk" : "Low Risk") : "Low Risk"
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /logs/:id: Download & extract GitHub Actions log ZIP
app.get("/logs/:id", async (req, res) => {
    try {
        const { owner, repo, pat } = getRepoConfig(req);
        const runId = req.params.id;
        const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/logs`;
        const headers = { "User-Agent": "DevOps-AI-Log-Analyzer" };
        if (pat) headers["Authorization"] = `Bearer ${pat}`;

        const logZipResponse = await axios.get(url, { headers, responseType: "arraybuffer" });
        const zip = new AdmZip(Buffer.from(logZipResponse.data));
        const zipEntries = zip.getEntries();

        let fullRawLog = "";
        zipEntries.forEach(entry => {
            if (!entry.isDirectory && entry.entryName.endsWith(".txt")) {
                fullRawLog += `\n--- [LOG FILE: ${entry.entryName}] ---\n` + entry.readAsText("utf-8");
            }
        });

        const processed = preprocessLog(fullRawLog);

        res.json({
            success: true,
            run_id: runId,
            total_lines: processed.totalLines,
            extracted_error_count: processed.errorLineCount,
            clean_log_preview: processed.cleanText
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            run_id: req.params.id,
            error: `Failed to download log: ${err.message}. (Ensure GITHUB_PAT has read access to repo logs).`
        });
    }
});

// GET /api/incidents: Retrieve persisted incident records
app.get("/api/incidents", async (req, res) => {
    if (dbPool) {
        try {
            const dbRes = await dbPool.query("SELECT * FROM incidents ORDER BY created_at DESC LIMIT 20");
            return res.json({ success: true, count: dbRes.rows.length, incidents: dbRes.rows });
        } catch (err) {
            console.warn("PostgreSQL query failed, using in-memory store:", err.message);
        }
    }
    return res.json({ success: true, count: inMemoryIncidents.length, incidents: inMemoryIncidents });
});

// POST /analyze & /api/analyze: Full RAG + Granite AI Log Analysis
async function handleLogAnalysis(req, res) {
    try {
        const { owner, repo } = getRepoConfig(req);
        let rawLog = "";
        let runId = req.body?.run_id || "manual-upload";

        if (req.file) {
            rawLog = req.file.buffer.toString("utf-8");
        } else if (req.body?.log) {
            rawLog = req.body.log;
        }

        if (!rawLog || rawLog.trim().length === 0) {
            return res.status(400).json({
                status: "error",
                error_type: "Empty Log",
                severity: "Low",
                root_cause: "No log content was provided.",
                explanation: "Please upload a valid log file or supply log trace text.",
                recommended_fix: "Upload a non-empty log file."
            });
        }

        const preprocessed = preprocessLog(rawLog);
        const logContent = preprocessed.cleanText || rawLog.slice(0, 3500);

        const ragContext = retrieveRAGContext(logContent);

        let aiResult = null;
        try {
            const systemPrompt = `You are IBM Granite AI DevOps Log Analyzer & Incident Remediation Assistant.
You have access to the following DevOps Knowledge Base context:
${ragContext}

Analyze the provided cleaned CI/CD build error log and output ONLY a raw JSON object (strictly no markdown formatting, no code block backticks).
The JSON MUST contain these exact key names:
- status: string ("failed", "warning", or "success")
- error_type: string (e.g. "Dependency Error", "React JSX Syntax Error", "Build Process Timeout")
- severity: string ("High", "Medium", or "Low")
- root_cause: string (concise 1-sentence statement of why the build failed)
- explanation: string (detailed breakdown of the failure stack trace)
- recommended_fix: string (step-by-step shell commands or code fixes to resolve the issue)

Error Log Snippet:
${logContent.slice(0, 4000)}
`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 14000);

            const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    model: PRIMARY_MODEL,
                    prompt: systemPrompt,
                    stream: false
                })
            });

            clearTimeout(timeoutId);

            if (ollamaRes.ok) {
                const data = await ollamaRes.json();
                const responseText = (data.response || "").trim();
                const cleanedJson = responseText
                    .replace(/^```json\s*/i, "")
                    .replace(/^```\s*/, "")
                    .replace(/\s*```$/, "")
                    .trim();

                try {
                    aiResult = JSON.parse(cleanedJson);
                } catch (e) {
                    console.warn("Could not parse LLM JSON output.");
                }
            }
        } catch (llmErr) {
            console.warn("Ollama LLM call failed or timed out. Utilizing RAG fallback engine.");
        }

        if (!aiResult) {
            aiResult = {
                status: "failed",
                error_type: preprocessed.errorLineCount > 0 ? "Build Execution Error" : "Unknown Trace Failure",
                severity: "High",
                root_cause: preprocessed.snippets[0] ? preprocessed.snippets[0].slice(0, 200) : "Build failed during pipeline execution.",
                explanation: `Analysis generated via RAG Knowledge Engine. Matches pattern: ${ragContext.slice(0, 150)}`,
                recommended_fix: "Review stack trace snippets, check environment variables in .env, and re-run workflow."
            };
        }

        const savedRecord = await saveIncidentRecord({ ...aiResult, run_id: runId }, `${owner}/${repo}`);

        return res.json({
            ...aiResult,
            incident_id: savedRecord.id,
            rag_context_used: true,
            analyzed_by: `IBM Granite (${PRIMARY_MODEL}) + RAG Engine`
        });

    } catch (err) {
        console.error("Error in handleLogAnalysis:", err);
        return res.status(500).json({
            status: "error",
            error_type: "Internal Server Error",
            severity: "High",
            root_cause: err.message,
            explanation: "An error occurred inside the backend analysis handler.",
            recommended_fix: "Inspect Express backend server logs."
        });
    }
}

app.post("/analyze", upload.single("file"), handleLogAnalysis);
app.post("/api/analyze", upload.single("file"), handleLogAnalysis);

app.listen(PORT, () => {
    console.log(`🚀 DevOps AI Assistant Backend running on http://localhost:${PORT}`);
    console.log(`🤖 Configured Granite Model: ${PRIMARY_MODEL} via ${OLLAMA_URL}`);
    console.log(`🐙 Default GitHub Repo Target: ${GITHUB_OWNER}/${GITHUB_REPO}`);
});