import { TicketPriority, TicketStatus } from "../models/Ticket.js";

export const SLA_HOURS_MAP: Record<TicketPriority, number> = {
  URGENT: 2,
  HIGH: 8,
  MEDIUM: 24,
  LOW: 48,
};

export interface SlaCalculationResult {
  isBreached: boolean;
  timeRemainingMs: number;
  timeRemainingHours: number;
  statusText: string;
  urgencyLevel: "SAFE" | "WARNING" | "BREACHED" | "RESOLVED";
  percentageRemaining: number;
}

export function calculateSlaDeadline(
  createdAt: Date = new Date(),
  priority: TicketPriority = "MEDIUM"
): { deadline: Date; slaHours: number } {
  const hours = SLA_HOURS_MAP[priority] ?? 24;
  const deadline = new Date(createdAt.getTime() + hours * 60 * 60 * 1000);
  return { deadline, slaHours: hours };
}

export function evaluateSlaStatus(
  deadline: Date,
  status: TicketStatus,
  createdAt: Date,
  resolvedAt?: Date | null,
  now: Date = new Date()
): SlaCalculationResult {
  const totalDurationMs = deadline.getTime() - createdAt.getTime();

  if (status === "RESOLVED" || status === "CLOSED") {
    const finalDate = resolvedAt ? new Date(resolvedAt) : now;
    const isBreached = finalDate.getTime() > deadline.getTime();
    return {
      isBreached,
      timeRemainingMs: 0,
      timeRemainingHours: 0,
      statusText: isBreached ? "Resolved (SLA Breached)" : "Resolved Within SLA",
      urgencyLevel: "RESOLVED",
      percentageRemaining: 100,
    };
  }

  const timeRemainingMs = deadline.getTime() - now.getTime();
  const timeRemainingHours = Math.round((timeRemainingMs / (1000 * 60 * 60)) * 10) / 10;
  const isBreached = timeRemainingMs <= 0;

  if (isBreached) {
    const overdueMs = Math.abs(timeRemainingMs);
    const overdueHours = Math.floor(overdueMs / (1000 * 60 * 60));
    const overdueMins = Math.floor((overdueMs % (1000 * 60 * 60)) / (1000 * 60));
    return {
      isBreached: true,
      timeRemainingMs,
      timeRemainingHours,
      statusText: `Breached by ${overdueHours}h ${overdueMins}m`,
      urgencyLevel: "BREACHED",
      percentageRemaining: 0,
    };
  }

  const percentageRemaining = Math.max(
    0,
    Math.min(100, Math.round((timeRemainingMs / totalDurationMs) * 100))
  );

  const hoursRemaining = Math.floor(timeRemainingMs / (1000 * 60 * 60));
  const minsRemaining = Math.floor(
    (timeRemainingMs % (1000 * 60 * 60)) / (1000 * 60)
  );

  const urgencyLevel: "SAFE" | "WARNING" =
    percentageRemaining <= 25 ? "WARNING" : "SAFE";

  return {
    isBreached: false,
    timeRemainingMs,
    timeRemainingHours,
    statusText: `${hoursRemaining}h ${minsRemaining}m left`,
    urgencyLevel,
    percentageRemaining,
  };
}

export function checkAutoEscalationRules(params: {
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: Date;
  slaDeadline: Date;
  sentimentScore?: number;
  sentiment?: string;
  now?: Date;
}): {
  shouldEscalate: boolean;
  reason: string;
  triggerType: "SLA_BREACH" | "AI_SENTIMENT" | "SYSTEM_RULE" | null;
} {
  const { priority, status, slaDeadline, sentimentScore = 0, sentiment = "", now = new Date() } = params;

  if (status === "RESOLVED" || status === "CLOSED" || status === "ESCALATED") {
    return { shouldEscalate: false, reason: "", triggerType: null };
  }

  if (now.getTime() > slaDeadline.getTime()) {
    return {
      shouldEscalate: true,
      reason: `SLA window expired (${priority} priority limit breached). Auto-escalated for immediate supervisor intervention.`,
      triggerType: "SLA_BREACH",
    };
  }

  if (sentiment === "FRUSTRATED" || sentimentScore <= -0.55) {
    return {
      shouldEscalate: true,
      reason: `High customer distress detected by AI sentiment analyzer (Score: ${sentimentScore.toFixed(
        2
      )}). Escalated for priority handling.`,
      triggerType: "AI_SENTIMENT",
    };
  }

  if (priority === "URGENT" && status === "OPEN") {
    const halfSlaMs = SLA_HOURS_MAP.URGENT * 60 * 60 * 1000 * 0.5;
    const timeSinceCreation = now.getTime() - params.createdAt.getTime();
    if (timeSinceCreation >= halfSlaMs) {
      return {
        shouldEscalate: true,
        reason: "URGENT ticket remained unattended in OPEN status for over 50% of its SLA window (1 hour).",
        triggerType: "SYSTEM_RULE",
      };
    }
  }

  return { shouldEscalate: false, reason: "", triggerType: null };
}
