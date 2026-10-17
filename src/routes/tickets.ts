import { Router, Response } from "express";
import { z } from "zod";
import { Ticket, TicketStatus } from "../models/Ticket.js";
import { TicketComment } from "../models/TicketComment.js";
import { EscalationLog } from "../models/EscalationLog.js";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { calculateSlaDeadline, checkAutoEscalationRules, evaluateSlaStatus } from "../services/sla.js";
import { analyzeTicketWithAi } from "../services/ai.js";

const router = Router();

const CreateTicketSchema = z.object({
  title: z.string().min(5).max(150),
  description: z.string().min(10).max(4000),
  category: z.enum(["TECHNICAL", "BILLING", "ACCOUNT", "GENERAL"]).default("GENERAL"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
});

const UpdateStatusSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "ESCALATED", "RESOLVED", "CLOSED"]),
  assignedTo: z.string().optional().nullable(),
  note: z.string().optional(),
});

const EscalateSchema = z.object({
  reason: z.string().min(5).max(500),
  notes: z.string().optional(),
});

const CommentSchema = z.object({
  message: z.string().min(1).max(3000),
  isInternalNote: z.boolean().default(false),
});

// GET /api/tickets (Filterable list)
router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { status, priority, category, q } = req.query;
    const query: Record<string, unknown> = {};

    if (req.user?.role === "CUSTOMER") {
      query.customer = req.user.userId;
    }

    if (status && status !== "ALL") query.status = status;
    if (priority && priority !== "ALL") query.priority = priority;
    if (category && category !== "ALL") query.category = category;

    if (q && typeof q === "string") {
      query.$or = [
        { title: { $regex: q, $options: "i" } },
        { ticketNumber: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
      ];
    }

    const tickets = await Ticket.find(query)
      .populate("customer", "name email role")
      .populate("assignedTo", "name email role")
      .sort({ createdAt: -1 })
      .lean();

    const now = new Date();
    const enriched = tickets.map((t) => {
      const slaStatus = evaluateSlaStatus(
        new Date(t.slaDeadline),
        t.status,
        new Date(t.createdAt),
        t.resolvedAt ? new Date(t.resolvedAt) : null,
        now
      );
      return { ...t, slaStatus };
    });

    res.json({ tickets: enriched });
  } catch (error) {
    console.error("List tickets error:", error);
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

// POST /api/tickets (Create with AI analysis & auto-escalate)
router.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parseResult = CreateTicketSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Validation failed", details: parseResult.error.flatten() });
      return;
    }

    const { title, description, category, priority } = parseResult.data;

    // Run AI analysis (Gemini -> Groq -> Heuristics)
    const aiAnalysis = await analyzeTicketWithAi({ title, description, category, priority });

    const createdAt = new Date();
    const { deadline, slaHours } = calculateSlaDeadline(createdAt, priority);

    // Business Logic: Check auto-escalation
    const decision = checkAutoEscalationRules({
      priority,
      status: "OPEN",
      createdAt,
      slaDeadline: deadline,
      sentimentScore: aiAnalysis.sentimentScore,
      sentiment: aiAnalysis.sentiment,
      now: createdAt,
    });

    const initialStatus = decision.shouldEscalate ? "ESCALATED" : "OPEN";
    const ticketNumber = `TC-${Math.floor(10000 + Math.random() * 90000)}`;

    const ticket = await Ticket.create({
      ticketNumber,
      title,
      description,
      category,
      priority,
      status: initialStatus,
      customer: req.user!.userId,
      slaHours,
      slaDeadline: deadline,
      slaBreached: false,
      aiAnalysis,
      tags: aiAnalysis.keyIssues || [],
    });

    if (decision.shouldEscalate) {
      await EscalationLog.create({
        ticketId: ticket._id,
        triggeredBy: undefined,
        triggerType: decision.triggerType || "AI_SENTIMENT",
        fromStatus: "OPEN",
        toStatus: "ESCALATED",
        reason: decision.reason,
        notes: `AI Sentiment: ${aiAnalysis.sentiment} (${aiAnalysis.sentimentScore}). Model: ${aiAnalysis.modelUsed}`,
      });
    }

    const populated = await Ticket.findById(ticket._id)
      .populate("customer", "name email role")
      .lean();

    res.status(201).json({ message: "Ticket created", ticket: populated, autoEscalated: decision.shouldEscalate });
  } catch (error) {
    console.error("Create ticket error:", error);
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

// GET /api/tickets/:id (Details)
router.get("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const ticket = await Ticket.findById(id)
      .populate("customer", "name email role")
      .populate("assignedTo", "name email role")
      .lean();

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (req.user?.role === "CUSTOMER" && ticket.customer._id.toString() !== req.user.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [comments, escalationLogs] = await Promise.all([
      TicketComment.find({ ticketId: id })
        .populate("author", "name email role")
        .sort({ createdAt: 1 })
        .lean(),
      EscalationLog.find({ ticketId: id })
        .populate("triggeredBy", "name email role")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const slaStatus = evaluateSlaStatus(
      new Date(ticket.slaDeadline),
      ticket.status,
      new Date(ticket.createdAt),
      ticket.resolvedAt ? new Date(ticket.resolvedAt) : null
    );

    res.json({ ticket: { ...ticket, slaStatus }, comments, escalationLogs });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch ticket" });
  }
});

// PATCH /api/tickets/:id (Status update)
router.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const ticket = await Ticket.findById(id);
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const parseResult = UpdateStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Validation failed" });
      return;
    }

    const { status: newStatus, assignedTo, note } = parseResult.data;
    const oldStatus = ticket.status;

    if (req.user?.role === "CUSTOMER") {
      if (ticket.customer.toString() !== req.user.userId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (newStatus !== "RESOLVED" && newStatus !== "OPEN") {
        res.status(403).json({ error: "Customers can only resolve or reopen their own tickets" });
        return;
      }
    }

    ticket.status = newStatus as TicketStatus;
    if (assignedTo !== undefined) {
      ticket.assignedTo = assignedTo ? (assignedTo as unknown as typeof ticket.assignedTo) : undefined;
    }

    if (newStatus === "RESOLVED" && !ticket.resolvedAt) ticket.resolvedAt = new Date();
    else if (newStatus === "CLOSED" && !ticket.closedAt) ticket.closedAt = new Date();
    else if (newStatus !== "RESOLVED" && newStatus !== "CLOSED") {
      ticket.resolvedAt = undefined;
      ticket.closedAt = undefined;
    }

    await ticket.save();

    if (newStatus === "ESCALATED" && oldStatus !== "ESCALATED") {
      await EscalationLog.create({
        ticketId: ticket._id,
        triggeredBy: req.user!.userId,
        triggerType: "MANUAL",
        fromStatus: oldStatus,
        toStatus: newStatus,
        reason: note || "Staff manual escalation",
      });
    }

    const updated = await Ticket.findById(id)
      .populate("customer", "name email role")
      .populate("assignedTo", "name email role")
      .lean();

    res.json({ message: "Ticket updated", ticket: updated });
  } catch (error) {
    res.status(500).json({ error: "Update failed" });
  }
});

// POST /api/tickets/:id/comments
router.post("/:id/comments", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const ticket = await Ticket.findById(id);
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const parseResult = CommentSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Validation failed" });
      return;
    }

    const { message, isInternalNote } = parseResult.data;
    const internalAllowed = req.user?.role !== "CUSTOMER" ? isInternalNote : false;

    const comment = await TicketComment.create({
      ticketId: ticket._id,
      author: req.user!.userId,
      message,
      isInternalNote: internalAllowed,
    });

    if (ticket.status === "OPEN" && req.user?.role !== "CUSTOMER") {
      ticket.status = "IN_PROGRESS";
      await ticket.save();
    }

    const populated = await TicketComment.findById(comment._id)
      .populate("author", "name email role")
      .lean();

    res.status(201).json({ message: "Comment added", comment: populated });
  } catch (error) {
    res.status(500).json({ error: "Failed to post comment" });
  }
});

// POST /api/tickets/:id/escalate
router.post("/:id/escalate", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const ticket = await Ticket.findById(id);
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const parseResult = EscalateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Validation failed" });
      return;
    }

    const { reason, notes } = parseResult.data;
    const oldStatus = ticket.status;
    ticket.status = "ESCALATED";
    if (ticket.priority === "LOW" || ticket.priority === "MEDIUM") {
      ticket.priority = "HIGH";
    }
    await ticket.save();

    const log = await EscalationLog.create({
      ticketId: ticket._id,
      triggeredBy: req.user!.userId,
      triggerType: "MANUAL",
      fromStatus: oldStatus,
      toStatus: "ESCALATED",
      reason,
      notes: notes || `By ${req.user!.name}`,
    });

    res.json({ message: "Ticket escalated", ticket, escalationLog: log });
  } catch (error) {
    res.status(500).json({ error: "Escalation failed" });
  }
});

// POST /api/tickets/:id/ai-analyze
router.post("/:id/ai-analyze", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const ticket = await Ticket.findById(id);
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const aiAnalysis = await analyzeTicketWithAi({
      title: ticket.title,
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
    });

    ticket.aiAnalysis = aiAnalysis;
    await ticket.save();

    res.json({ message: "AI re-analysis complete", aiAnalysis });
  } catch (error) {
    res.status(500).json({ error: "AI analysis failed" });
  }
});

export default router;
