import { describe, it, expect } from "vitest";
import {
  calculateSlaDeadline,
  evaluateSlaStatus,
  checkAutoEscalationRules,
} from "../services/sla.js";

describe("Backend SLA Business Logic Engine", () => {
  it("should calculate correct SLA deadlines for each priority", () => {
    const baseDate = new Date("2026-10-19T10:00:00Z");

    const urgent = calculateSlaDeadline(baseDate, "URGENT");
    expect(urgent.slaHours).toBe(2);
    expect(urgent.deadline.toISOString()).toBe("2026-10-19T12:00:00.000Z");

    const high = calculateSlaDeadline(baseDate, "HIGH");
    expect(high.slaHours).toBe(8);

    const medium = calculateSlaDeadline(baseDate, "MEDIUM");
    expect(medium.slaHours).toBe(24);

    const low = calculateSlaDeadline(baseDate, "LOW");
    expect(low.slaHours).toBe(48);
  });

  it("should detect SLA breach when current time exceeds deadline", () => {
    const created = new Date("2026-10-19T10:00:00Z");
    const deadline = new Date("2026-10-19T12:00:00Z");
    const now = new Date("2026-10-19T13:30:00Z");

    const status = evaluateSlaStatus(deadline, "OPEN", created, null, now);
    expect(status.isBreached).toBe(true);
    expect(status.urgencyLevel).toBe("BREACHED");
  });

  it("should auto-escalate ticket if sentiment is FRUSTRATED", () => {
    const created = new Date();
    const deadline = new Date(created.getTime() + 24 * 3600 * 1000);

    const check = checkAutoEscalationRules({
      priority: "MEDIUM",
      status: "OPEN",
      createdAt: created,
      slaDeadline: deadline,
      sentiment: "FRUSTRATED",
      sentimentScore: -0.75,
    });

    expect(check.shouldEscalate).toBe(true);
    expect(check.triggerType).toBe("AI_SENTIMENT");
  });
});
