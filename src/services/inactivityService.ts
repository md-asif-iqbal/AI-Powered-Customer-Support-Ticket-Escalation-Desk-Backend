import { Ticket } from "../models/Ticket.js";
import { User } from "../models/User.js";
import { TicketComment } from "../models/TicketComment.js";
import { EscalationLog } from "../models/EscalationLog.js";

export interface ReassignmentResult {
  ticketId: string;
  ticketNumber: string;
  previousAgent: { id: string; name: string };
  newAgent: { id: string; name: string };
  inactiveMinutes: number;
  reason: string;
}

/**
 * Checks for tickets where the assigned agent has not replied to the customer
 * within the specified threshold (default 15 minutes), and automatically reassigns
 * the ticket to the next available agent with the lowest active workload.
 */
export async function checkAndReassignInactiveTickets(
  thresholdMinutes = 15
): Promise<ReassignmentResult[]> {
  try {
    const thresholdMs = thresholdMinutes * 60 * 1000;
    const now = Date.now();

    // Query active tickets that are assigned to an agent and have no staff first response
    const activeTickets = await Ticket.find({
      status: { $in: ["OPEN", "IN_PROGRESS", "ESCALATED"] },
      assignedTo: { $ne: null },
      firstResponseAt: null,
    }).populate("assignedTo", "name email role");

    if (activeTickets.length === 0) return [];

    const results: ReassignmentResult[] = [];

    // Pre-fetch available agents
    const availableStaff = await User.find({ role: { $in: ["AGENT", "ADMIN"] } }).lean();
    const agentsOnly = availableStaff.filter((u) => u.role === "AGENT");
    const pool = agentsOnly.length > 0 ? agentsOnly : availableStaff;

    for (const ticket of activeTickets) {
      const assignedAtTime = ticket.lastAssignedAt
        ? new Date(ticket.lastAssignedAt).getTime()
        : new Date(ticket.createdAt).getTime();

      const elapsedMs = now - assignedAtTime;
      if (elapsedMs < thresholdMs) {
        continue;
      }

      // Check if assigned agent posted any comment after assignedAtTime
      const previousAgentId = ticket.assignedTo?._id
        ? ticket.assignedTo._id.toString()
        : ticket.assignedTo?.toString() || "";
      const previousAgentName = (ticket.assignedTo as any)?.name || "Agent";

      const staffReply = await TicketComment.findOne({
        ticketId: ticket._id,
        author: previousAgentId,
        isInternalNote: false,
        createdAt: { $gte: new Date(assignedAtTime) },
      });

      if (staffReply) {
        ticket.firstResponseAt = staffReply.createdAt;
        await ticket.save();
        continue;
      }

      // Candidate selection: exclude current unresponsive agent
      const candidates = pool.filter((u) => u._id.toString() !== previousAgentId);
      if (candidates.length === 0) {
        // No alternate agents available right now
        if (!ticket.firstResponseBreached) {
          ticket.firstResponseBreached = true;
          await ticket.save();
        }
        continue;
      }

      // Calculate candidate workloads
      const candidateWorkloads = await Promise.all(
        candidates.map(async (c) => {
          const load = await Ticket.countDocuments({
            $or: [{ assignedTo: c._id }, { assignedAgents: c._id }],
            status: { $in: ["OPEN", "IN_PROGRESS", "ESCALATED"] },
          });
          return { candidate: c, load, isFree: load === 0 };
        })
      );

      // Sort by availability: Free agents first, then lowest active load
      candidateWorkloads.sort((a, b) => {
        if (a.isFree && !b.isFree) return -1;
        if (!a.isFree && b.isFree) return 1;
        return a.load - b.load;
      });

      const selected = candidateWorkloads[0];
      const newAgent = selected.candidate;
      const inactiveMinutes = Math.floor(elapsedMs / (60 * 1000));

      // Reassign ticket to the new agent
      ticket.assignedTo = newAgent._id;
      ticket.assignedAgents = [newAgent._id];
      ticket.lastAssignedAt = new Date();
      ticket.reassignmentCount = (ticket.reassignmentCount || 0) + 1;
      ticket.firstResponseBreached = true;
      if (ticket.status === "OPEN") {
        ticket.status = "IN_PROGRESS";
      }

      if (ticket.aiAnalysis) {
        ticket.aiAnalysis.assignedAgentName = newAgent.name;
        ticket.aiAnalysis.assignedAgentNames = [`${newAgent.name} (AI Reassigned)`];
      }

      await ticket.save();

      // Log AI system comment
      await TicketComment.create({
        ticketId: ticket._id,
        author: newAgent._id,
        message: `🤖 [AI Auto-Reassignment Triggered]: Previous assignee (${previousAgentName}) did not respond within ${thresholdMinutes} minutes of assignment (${inactiveMinutes}m elapsed). AI has automatically switched and reassigned this ticket to ${newAgent.name} (Active load: ${selected.load} tickets) for immediate resolution.`,
        isInternalNote: true,
        isAiGenerated: true,
      });

      // Record EscalationLog
      await EscalationLog.create({
        ticketId: ticket._id,
        triggeredBy: undefined,
        triggerType: "AGENT_INACTIVITY",
        fromStatus: ticket.status,
        toStatus: ticket.status,
        reason: `Agent ${previousAgentName} inactive for ${inactiveMinutes}m without reply (threshold: ${thresholdMinutes}m). Automatically rerouted to ${newAgent.name}.`,
        notes: `AI Auto-Switch Reassignment #${ticket.reassignmentCount}. SLA First-Response Guarantee rule enforced.`,
      });

      results.push({
        ticketId: ticket._id.toString(),
        ticketNumber: ticket.ticketNumber,
        previousAgent: { id: previousAgentId, name: previousAgentName },
        newAgent: { id: newAgent._id.toString(), name: newAgent.name },
        inactiveMinutes,
        reason: `Agent ${previousAgentName} did not reply within ${thresholdMinutes} minutes.`,
      });
    }

    return results;
  } catch (err) {
    console.error("[InactivityWatchdog] Error during check:", err);
    return [];
  }
}

let watchdogInterval: NodeJS.Timeout | null = null;

/**
 * Starts periodic background polling watchdog for inactive agent reassignments.
 */
export function startAgentInactivityWatchdog(intervalMs = 60000, thresholdMinutes = 15): void {
  if (watchdogInterval) return;

  console.log(
    `⚡ [InactivityWatchdog] Started: Checking every ${Math.round(
      intervalMs / 1000
    )}s for tickets where agent did not reply within ${thresholdMinutes}m.`
  );

  // Initial check on startup
  checkAndReassignInactiveTickets(thresholdMinutes).catch((err) =>
    console.error("[InactivityWatchdog] Startup check error:", err)
  );

  watchdogInterval = setInterval(() => {
    checkAndReassignInactiveTickets(thresholdMinutes).catch((err) =>
      console.error("[InactivityWatchdog] Interval error:", err)
    );
  }, intervalMs);
}
