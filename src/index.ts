import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.js";
import ticketRoutes from "./routes/tickets.js";
import statsRoutes from "./routes/stats.js";
import { runSeed } from "./scripts/seed.js";
import { Ticket } from "./models/Ticket.js";

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
    origin: [process.env.FRONTEND_URL || "http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000"],
    credentials: true,
  })
);
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/stats", statsRoutes);

// Health Check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "NT DeskAI Backend API",
    models: {
      gemini: "gemini-3.8-flash",
      groq: "openai/gpt-oss-20b",
      nlp: "active",
    },
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[Server Error]:", err.stack);
  res.status(500).json({ error: "Internal Server Error", message: err.message });
});

// Start server
async function startServer() {
  try {
    await connectDB();

    // Auto-seed Atlas if clean/empty
    const count = await Ticket.countDocuments();
    if (count === 0) {
      console.log("[Seed] Fresh database detected. Automatically seeding demo data...");
      await runSeed();
      console.log("[Seed] Demo users and tickets seeded into MongoDB Atlas.");
    }

    app.listen(PORT, () => {
      console.log(`🚀 [Server] NT DeskAI Backend running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

startServer();
