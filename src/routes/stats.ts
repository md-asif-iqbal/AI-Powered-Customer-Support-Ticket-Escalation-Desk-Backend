import { Router, Response } from "express";
import { Ticket } from "../models/Ticket.js";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.user?.role === "CUSTOMER") {
      filter.customer = req.user.userId;
    }

    const tickets = await Ticket.find(filter).lean();
    const total = tickets.length;
    let open = 0, inProgress = 0, escalated = 0, resolved = 0, closed = 0, urgent = 0, breached = 0;
    const now = new Date();

    for (const t of tickets) {
      if (t.status === "OPEN") open++;
      else if (t.status === "IN_PROGRESS") inProgress++;
      else if (t.status === "ESCALATED") escalated++;
      else if (t.status === "RESOLVED") resolved++;
      else if (t.status === "CLOSED") closed++;

      if (t.priority === "URGENT") urgent++;

      const isResolved = t.status === "RESOLVED" || t.status === "CLOSED";
      const checkDate = isResolved && t.resolvedAt ? new Date(t.resolvedAt) : now;
      if (checkDate.getTime() > new Date(t.slaDeadline).getTime()) breached++;
    }

    const slaComplianceRate = total > 0 ? Math.round(((total - breached) / total) * 100) : 100;

    res.json({
      stats: {
        total,
        open,
        inProgress,
        escalated,
        resolved,
        closed,
        urgent,
        breached,
        slaComplianceRate,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
