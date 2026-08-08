import express from "express";
import cors from "cors";
import multer from "multer";

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const PRIMARY_MODEL = "granite4:3b";

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Configure Multer memory storage for log file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Health check endpoint
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "DevOps AI Log Analyzer Backend is active 🚀",
        model: PRIMARY_MODEL,
        timestamp: new Date().toISOString()
    });
});

// Fallback rule-based log analysis if LLM service is unavailable
function fallbackAnalysis(logText) {
    let result = {
        status: "failed",
        error_type: "Unknown Error",
        severity: "Low",
        root_cause: "Unable to automatically classify error pattern",
        suggestion: "Review stack trace and inspect system event logs manually.",
        source: "Rule Engine Fallback"
    };

    if (!logText || logText.trim().length === 0) {
        return {
            status: "unknown",
            error_type: "Empty Log",
            severity: "Low",
            root_cause: "No log content provided",
            suggestion: "Upload a valid non-empty log file.",
            source: "Rule Engine Fallback"
        };
    }

    if (logText.includes("ERR_MODULE_NOT_FOUND") || logText.includes("Cannot find module")) {
        result = {
            status: "failed",
            error_type: "Dependency Error",
            severity: "High",
            root_cause: "Required npm module is missing from node_modules.",
            suggestion: "Run `npm install` and verify package.json dependencies.",
            source: "Rule Engine Fallback"
        };
    } else if (logText.includes("Expected corresponding JSX closing tag") || logText.includes("Unterminated JSX")) {
        result = {
            status: "failed",
            error_type: "React JSX Syntax Error",
            severity: "High",
            root_cause: "Missing closing tag or mismatched brackets in JSX file.",
            suggestion: "Inspect component return statement and properly close all opened JSX elements.",
            source: "Rule Engine Fallback"
        };
    } else if (logText.includes("SyntaxError")) {
        result = {
            status: "failed",
            error_type: "Syntax Error",
            severity: "High",
            root_cause: "Invalid code syntax prevents compilation/execution.",
            suggestion: "Fix syntax issues indicated by the line number in the stack trace.",
            source: "Rule Engine Fallback"
        };
    } else if (logText.includes("ECONNREFUSED") || logText.includes("Failed to fetch")) {
        result = {
            status: "failed",
            error_type: "Network Connection Error",
            severity: "High",
            root_cause: "Target service or database endpoint is unreachable.",
            suggestion: "Ensure target server is running and firewall/ports are correctly configured.",
            source: "Rule Engine Fallback"
        };
    } else if (logText.includes("ENOSPC") || logText.includes("Out of Memory") || logText.includes("heap limit")) {
        result = {
            status: "failed",
            error_type: "Resource Exhaustion",
            severity: "High",
            root_cause: "Node.js process memory allocation limit or disk space reached.",
            suggestion: "Increase NODE_OPTIONS=--max-old-space-size=4096 or free up disk space.",
            source: "Rule Engine Fallback"
        };
    }

    return result;
}

// Log analysis handler
async function handleAnalysis(req, res) {
    try {
        let logText = "";

        if (req.file) {
            logText = req.file.buffer.toString("utf-8");
        } else if (req.body && req.body.log) {
            logText = req.body.log;
        } else if (typeof req.body === "string") {
            logText = req.body;
        }

        if (!logText || logText.trim().length === 0) {
            return res.status(400).json({
                status: "error",
                error_type: "Invalid Input",
                severity: "Low",
                root_cause: "No log content was uploaded or passed.",
                suggestion: "Please upload a valid log file or supply log text."
            });
        }

        // Try calling Ollama API with granite4:3b
        try {
            const prompt = `You are an expert DevOps engineer and AI Log Analyzer.
Analyze the following log and return ONLY a valid raw JSON object (no markdown, no backticks, no markdown fence block).
The JSON object MUST strictly contain the following keys:
- status: string ("failed", "warning", or "success")
- error_type: string (e.g. "Dependency Error", "Syntax Error", "Database Connection Failure")
- severity: string ("High", "Medium", or "Low")
- root_cause: string (concise clear explanation of why it failed)
- suggestion: string (actionable step-by-step fix)

Log Content:
${logText.slice(0, 4000)}
`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);

            const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    model: PRIMARY_MODEL,
                    prompt: prompt,
                    stream: false
                })
            });

            clearTimeout(timeoutId);

            if (ollamaRes.ok) {
                const data = await ollamaRes.json();
                const responseText = data.response ? data.response.trim() : "";

                // Clean markdown code blocks if any
                const cleanedJson = responseText
                    .replace(/^```json\s*/i, "")
                    .replace(/^```\s*/, "")
                    .replace(/\s*```$/, "")
                    .trim();

                try {
                    const parsedResult = JSON.parse(cleanedJson);
                    return res.json({
                        ...parsedResult,
                        analyzed_by: `Ollama (${PRIMARY_MODEL})`
                    });
                } catch (parseError) {
                    console.warn("Could not parse JSON from Ollama output, falling back to rule engine.");
                }
            }
        } catch (ollamaErr) {
            console.warn("Ollama service unreachable or timed out. Utilizing fallback rule engine.");
        }

        // Fallback analysis if Ollama call fails or yields invalid JSON
        const fallbackRes = fallbackAnalysis(logText);
        return res.json(fallbackRes);

    } catch (err) {
        console.error("Error processing log analysis:", err);
        return res.status(500).json({
            status: "error",
            error_type: "Internal Server Error",
            severity: "High",
            root_cause: err.message,
            suggestion: "Check backend server logs and verify express app configuration."
        });
    }
}

// Endpoint supporting both single file uploads and JSON payload
app.post("/analyze", upload.single("file"), handleAnalysis);
app.post("/api/analyze", upload.single("file"), handleAnalysis);

app.listen(PORT, () => {
    console.log(`🚀 DevOps AI Backend Server running on http://localhost:${PORT}`);
    console.log(`🤖 Configured LLM Model: ${PRIMARY_MODEL} via ${OLLAMA_URL}`);
});