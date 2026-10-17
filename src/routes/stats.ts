import { Router, Response } from "express";
import { Ticket } from "../models/Ticket.js";
import { User } from "../models/User.js";
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

// GET /api/stats/leaderboard (Agent Performance & AI Service Leaderboard)
router.get("/leaderboard", requireAuth, async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const now = new Date();
    // Query all support staff (AGENTs and ADMINs)
    const staff = await User.find({ role: { $in: ["AGENT", "ADMIN"] } }).lean();

    const leaderboard = await Promise.all(
      staff.map(async (agent) => {
        // Find tickets where agent is assignedTo or in assignedAgents
        const tickets = await Ticket.find({
          $or: [{ assignedTo: agent._id }, { assignedAgents: agent._id }],
        }).lean();

        const totalAssigned = tickets.length;
        let ticketsResolved = 0;
        let activeTickets = 0;
        let breachedCount = 0;
        let totalResolutionTimeHours = 0;
        let positiveSentimentCount = 0;
        const ratings: number[] = [];
        let reportsCount = 0;
        const customerReviews: { rating: number; comment: string; submittedAt: Date; ticketNumber: string }[] = [];

        for (const t of tickets) {
          const isResolved = t.status === "RESOLVED" || t.status === "CLOSED";
          if (isResolved) {
            ticketsResolved++;
            if (t.resolvedAt) {
              const resTime = (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60);
              totalResolutionTimeHours += Math.max(0.1, resTime);
            }
            if (t.aiAnalysis?.sentiment === "POSITIVE" || t.aiAnalysis?.sentiment === "NEUTRAL") {
              positiveSentimentCount++;
            }
          } else {
            activeTickets++;
          }

          if (t.customerFeedback?.rating) {
            ratings.push(t.customerFeedback.rating);
            if (t.customerFeedback.comment) {
              customerReviews.push({
                rating: t.customerFeedback.rating,
                comment: t.customerFeedback.comment,
                submittedAt: t.customerFeedback.submittedAt || (t as any).updatedAt,
                ticketNumber: t.ticketNumber,
              });
            }
          }

          if (t.customerFeedback?.isReported) {
            reportsCount++;
          }

          // SLA Breach check
          const checkDate = isResolved && t.resolvedAt ? new Date(t.resolvedAt) : now;
          if (checkDate.getTime() > new Date(t.slaDeadline).getTime() || t.slaBreached) {
            breachedCount++;
          }
        }

        const reviewCount = ratings.length;
        const avgRating =
          reviewCount > 0
            ? Number((ratings.reduce((acc, curr) => acc + curr, 0) / reviewCount).toFixed(1))
            : 4.8; // default baseline for unreviewed

        const slaComplianceRate =
          ticketsResolved > 0
            ? Math.round(((ticketsResolved - breachedCount) / ticketsResolved) * 100)
            : totalAssigned === 0 ? 100 : Math.max(75, Math.round(((totalAssigned - breachedCount) / totalAssigned) * 100));

        const avgResolutionTimeHours =
          ticketsResolved > 0
            ? Number((totalResolutionTimeHours / ticketsResolved).toFixed(1))
            : 0;

        const customerSatisfaction =
          ticketsResolved > 0
            ? Math.round((positiveSentimentCount / ticketsResolved) * 100)
            : 95;

        // Real-time Availability status based on active load
        const availability = activeTickets === 0 ? "Free" : activeTickets <= 2 ? "Available" : "Busy";

        // AI Composite Performance Score (0-100)
        // Weighted formula factoring in all operational metrics:
        // - Volume points: up to 35 pts
        // - SLA compliance: up to 25 pts
        // - Customer Star Rating: up to 25 pts (avgRating / 5 * 25)
        // - Customer Sentiment / CSAT: up to 15 pts
        // - Customer Report Penalty: -15 pts per incident report filed against the agent!
        // - Backlog penalty if activeTickets > 3: -3 pts each
        const volumePts = Math.min(35, ticketsResolved * 7 + (agent.role === "AGENT" ? 14 : 7));
        const slaPts = (slaComplianceRate / 100) * 25;
        const ratingPts = (avgRating / 5) * 25;
        const csatPts = (customerSatisfaction / 100) * 15;
        const reportPenalty = reportsCount * 15;
        const backlogPenalty = activeTickets > 3 ? (activeTickets - 3) * 3 : 0;

        const aiPerformanceScore = Math.max(
          30,
          Math.min(100, Math.round(volumePts + slaPts + ratingPts + csatPts - reportPenalty - backlogPenalty))
        );

        return {
          id: agent._id.toString(),
          name: agent.name,
          email: agent.email,
          role: agent.role,
          totalAssigned,
          ticketsResolved,
          activeTickets,
          slaComplianceRate: Math.max(0, Math.min(100, slaComplianceRate)),
          avgResolutionTimeHours,
          customerSatisfaction: Math.max(70, Math.min(100, customerSatisfaction)),
          avgRating,
          reviewCount,
          reportsCount,
          recentReviews: customerReviews.slice(0, 3),
          aiPerformanceScore,
          availability,
        };
      })
    );

    // Sort by aiPerformanceScore descending, then ticketsResolved
    leaderboard.sort((a, b) => b.aiPerformanceScore - a.aiPerformanceScore || b.ticketsResolved - a.ticketsResolved);

    // Assign Rank and Badges
    const enrichedLeaderboard = leaderboard.map((item, index) => {
      const rank = index + 1;
      let badge = "Customer Hero 🌟";
      if (rank === 1) badge = "MVP Top Performer 🏆";
      else if (rank === 2) badge = "Speed Demon ⚡";
      else if (rank === 3) badge = "SLA Champion 🎯";

      return {
        ...item,
        rank,
        badge,
      };
    });

    const totalTeamResolved = enrichedLeaderboard.reduce((acc, curr) => acc + curr.ticketsResolved, 0);
    const avgTeamSla =
      enrichedLeaderboard.length > 0
        ? Math.round(
            enrichedLeaderboard.reduce((acc, curr) => acc + curr.slaComplianceRate, 0) /
              enrichedLeaderboard.length
          )
        : 100;

    res.json({
      leaderboard: enrichedLeaderboard,
      summary: {
        topPerformer: enrichedLeaderboard[0] || null,
        totalTeamResolved,
        avgTeamSla,
        activeStaffCount: enrichedLeaderboard.length,
      },
    });
  } catch (error) {
    console.error("Leaderboard error:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

export default router;
