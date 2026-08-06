import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "Backend is running 🚀",
        project: "AI DevOps Assistant"
    });
});

const PORT = 3000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});