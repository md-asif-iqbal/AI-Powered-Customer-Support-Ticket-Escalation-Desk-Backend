import { Router, Response } from "express";
import { z } from "zod";
import { User } from "../models/User.js";
import { Ticket } from "../models/Ticket.js";
import {
  hashPassword,
  comparePassword,
  signToken,
  requireAuth,
  AuthenticatedRequest,
} from "../middleware/auth.js";
import { runSeed } from "../scripts/seed.js";

const router = Router();

const RegisterSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["CUSTOMER", "AGENT", "ADMIN"]).default("CUSTOMER"),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const FirebaseSyncSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  firebaseUid: z.string().min(1),
  authProvider: z.enum(["GOOGLE", "FIREBASE"]).default("GOOGLE"),
  role: z.enum(["CUSTOMER", "AGENT", "ADMIN"]).default("CUSTOMER"),
  avatarUrl: z.string().optional(),
});

// Standard Email Registration
router.post("/register", async (req, res): Promise<void> => {
  try {
    const parseResult = RegisterSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Validation failed", details: parseResult.error.flatten() });
      return;
    }

    const { name, email, password, role } = parseResult.data;
    const existing = await User.findOne({ email });
    if (existing) {
      res.status(409).json({ error: "Account with this email already exists" });
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({
      name,
      email,
      passwordHash,
      authProvider: "LOCAL",
      role,
    });

    const tokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = signToken(tokenPayload);
    res.status(201).json({ message: "Registration successful", user: tokenPayload, token });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Failed to register user" });
  }
});

// Standard Email Login
router.post("/login", async (req, res): Promise<void> => {
  try {
    const parseResult = LoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Invalid credentials format" });
      return;
    }

    const { email, password } = parseResult.data;
    const user = await User.findOne({ email });
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const tokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = signToken(tokenPayload);
    res.json({ message: "Login successful", user: tokenPayload, token });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
});

// Firebase Auth Sync (Google Sign-In & Firebase Email/Password)
router.post("/firebase-sync", async (req, res): Promise<void> => {
  try {
    const parseResult = FirebaseSyncSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Invalid Firebase payload", details: parseResult.error.flatten() });
      return;
    }

    const { email, name, firebaseUid, authProvider, role, avatarUrl } = parseResult.data;

    // Find or create in MongoDB Atlas
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name,
        email,
        firebaseUid,
        authProvider,
        role: role || "CUSTOMER",
        avatarUrl: avatarUrl || "",
      });
    } else {
      user.firebaseUid = firebaseUid;
      if (avatarUrl && !user.avatarUrl) user.avatarUrl = avatarUrl;
      await user.save();
    }

    const tokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = signToken(tokenPayload);
    res.json({ message: "Firebase sync successful", user: tokenPayload, token });
  } catch (error) {
    console.error("Firebase sync error:", error);
    res.status(500).json({ error: "Failed to sync Firebase user" });
  }
});

// Get Current Profile
router.get("/me", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await User.findById(req.user.userId).select("-passwordHash");
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    let assignedTicketsCount = 0;
    if (user.role === "AGENT" || user.role === "ADMIN") {
      assignedTicketsCount = await Ticket.countDocuments({
        $or: [{ assignedTo: user._id }, { assignedAgents: user._id }],
        status: { $in: ["OPEN", "IN_PROGRESS", "ESCALATED"] },
      });
    }

    res.json({ user, assignedTicketsCount });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Seed Endpoint
router.post("/seed", async (_req, res): Promise<void> => {
  try {
    const result = await runSeed();
    res.json(result);
  } catch (error: unknown) {
    res.status(500).json({ error: "Seed failed", details: error instanceof Error ? error.message : "Error" });
  }
});

export default router;
