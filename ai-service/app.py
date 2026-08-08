from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="DevOps AI Analyzer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "message": "AI Log Analyzer Running 🚀"
    }


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    content = await file.read()
    log = content.decode()

    result = {
        "status": "failed",
        "error_type": "Unknown",
        "severity": "Low",
        "root_cause": "Unknown",
        "suggestion": "Investigate manually"
    }

    if "ERR_MODULE_NOT_FOUND" in log:
        result = {
            "status": "failed",
            "error_type": "Dependency Error",
            "severity": "High",
            "root_cause": "Missing npm package",
            "suggestion": "Run npm install and commit package-lock.json"
        }

    elif "Expected corresponding JSX closing tag" in log:
        result = {
            "status": "failed",
            "error_type": "React JSX Error",
            "severity": "High",
            "root_cause": "Missing closing JSX tag",
            "suggestion": "Close the JSX element properly"
        }

    elif "SyntaxError" in log:
        result = {
            "status": "failed",
            "error_type": "Syntax Error",
            "severity": "High",
            "root_cause": "Invalid JavaScript syntax",
            "suggestion": "Fix the syntax error"
        }

    return result