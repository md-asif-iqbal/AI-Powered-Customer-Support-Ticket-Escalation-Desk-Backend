import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.js";
import ticketRoutes from "./routes/tickets.js";
import statsRoutes from "./routes/stats.js";
import { runSeed } from "./scripts/seed.js";
import { Ticket } from "./models/Ticket.js";
import { startAgentInactivityWatchdog } from "./services/inactivityService.js";

import path from "path";

dotenv.config();
// Support running from monorepo root or backend directory
dotenv.config({ path: path.resolve(process.cwd(), "backend/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = [
        process.env.FRONTEND_URL,
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
      ].filter(Boolean);

      if (
        allowed.includes(origin) ||
        origin.endsWith(".vercel.app") ||
        process.env.FRONTEND_URL === "*"
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  }),
);
app.use(express.json());

// Ensure DB connection for serverless requests (Vercel)
app.use(async (_req, _res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/stats", statsRoutes);

// Health Check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "Help Desk AI Backend API",
    models: {
      gemini: "gemini-3.8-flash",
      groq: "openai/gpt-oss-20b",
      nlp: "active",
    },
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("[Server Error]:", err.stack);
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  },
);

// Start server
async function startServer() {
  try {
    await connectDB();

    // Auto-seed Atlas if clean/empty
    const count = await Ticket.countDocuments();
    if (count === 0) {
      console.log(
        "[Seed] Fresh database detected. Automatically seeding demo data...",
      );
      await runSeed();
      console.log("[Seed] Demo users and tickets seeded into MongoDB Atlas.");
    }

    app.listen(PORT, () => {
      console.log(
        `🚀 [Server] Help Desk AI Backend running at http://localhost:${PORT}`,
      );
      // Start background auto-switch watchdog (checks every 30s for 15-minute inactivity)
      startAgentInactivityWatchdog(30000, 15);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

// Only start standalone listener when not running on Vercel Serverless
if (!process.env.VERCEL) {
  startServer();
}

export default app;
