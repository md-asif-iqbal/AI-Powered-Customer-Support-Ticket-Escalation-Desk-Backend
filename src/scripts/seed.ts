import { User } from "../models/User.js";
import { Ticket } from "../models/Ticket.js";
import { TicketComment } from "../models/TicketComment.js";
import { EscalationLog } from "../models/EscalationLog.js";
import { hashPassword } from "../middleware/auth.js";
import { calculateSlaDeadline } from "../services/sla.js";
import { analyzeTicketHeuristically } from "../services/ai.js";

export async function runSeed() {
  const demoPasswordHash = await hashPassword("password123");

  const customer = await User.findOneAndUpdate(
    { email: "customer@demo.com" },
    {
      name: "John Customer",
      email: "customer@demo.com",
      passwordHash: demoPasswordHash,
      role: "CUSTOMER",
      authProvider: "LOCAL",
    },
    { upsert: true, new: true }
  );

  const agent = await User.findOneAndUpdate(
    { email: "agent@demo.com" },
    {
      name: "Sarah Agent",
      email: "agent@demo.com",
      passwordHash: demoPasswordHash,
      role: "AGENT",
      authProvider: "LOCAL",
    },
    { upsert: true, new: true }
  );

  await User.findOneAndUpdate(
    { email: "admin@demo.com" },
    {
      name: "Alex Admin",
      email: "admin@demo.com",
      passwordHash: demoPasswordHash,
      role: "ADMIN",
      authProvider: "LOCAL",
    },
    { upsert: true, new: true }
  );

  await Ticket.deleteMany({});
  await TicketComment.deleteMany({});
  await EscalationLog.deleteMany({});

  const now = new Date();

  // 1. Escalated Billing Outage (Auto-Escalated by AI)
  const t1Title = "URGENT: Payment gateway double charged client and checkout crashed";
  const t1Desc =
    "This is completely unacceptable. Our checkout threw error 500 and double charged our customer credit card. Refund now and fix immediately!";
  const t1Ai = analyzeTicketHeuristically({ title: t1Title, description: t1Desc });
  const t1Created = new Date(now.getTime() - 90 * 60 * 1000);
  const t1Sla = calculateSlaDeadline(t1Created, "URGENT");

  const ticket1 = await Ticket.create({
    ticketNumber: "TC-90412",
    title: t1Title,
    description: t1Desc,
    category: "BILLING",
    priority: "URGENT",
    status: "ESCALATED",
    customer: customer._id,
    assignedTo: agent._id,
    slaHours: t1Sla.slaHours,
    slaDeadline: t1Sla.deadline,
    slaBreached: false,
    aiAnalysis: t1Ai,
    tags: ["billing", "crash", "payment", "urgent"],
    createdAt: t1Created,
  });

  await EscalationLog.create({
    ticketId: ticket1._id,
    triggeredBy: undefined,
    triggerType: "AI_SENTIMENT",
    fromStatus: "OPEN",
    toStatus: "ESCALATED",
    reason: "High customer distress detected by AI sentiment analyzer (Score: -0.85). Priority set to URGENT.",
    notes: "Auto-escalated at ticket inception.",
    createdAt: t1Created,
  });

  await TicketComment.create({
    ticketId: ticket1._id,
    author: agent._id,
    message: "Investigating gateway server logs. Payment provider confirmed transient webhook latency spike.",
    isInternalNote: false,
    createdAt: new Date(t1Created.getTime() + 20 * 60 * 1000),
  });

  // 2. High Priority In Progress
  const t2Title = "REST API Webhooks returning 504 Gateway Timeout intermittently";
  const t2Desc =
    "During peak afternoon volume, webhook dispatches fail with 504. Please check if connection pool is saturated.";
  const t2Ai = analyzeTicketHeuristically({ title: t2Title, description: t2Desc });
  const t2Created = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const t2Sla = calculateSlaDeadline(t2Created, "HIGH");

  await Ticket.create({
    ticketNumber: "TC-81204",
    title: t2Title,
    description: t2Desc,
    category: "TECHNICAL",
    priority: "HIGH",
    status: "IN_PROGRESS",
    customer: customer._id,
    assignedTo: agent._id,
    slaHours: t2Sla.slaHours,
    slaDeadline: t2Sla.deadline,
    slaBreached: false,
    aiAnalysis: t2Ai,
    tags: ["api", "latency", "timeout"],
    createdAt: t2Created,
  });

  // 3. Breached Ticket
  const t3Title = "Database replica lag causing stale reports on dashboard";
  const t3Desc = "Reports generated at midnight display data from 2 days ago. Please check replica synchronization.";
  const t3Ai = analyzeTicketHeuristically({ title: t3Title, description: t3Desc });
  const t3Created = new Date(now.getTime() - 36 * 60 * 60 * 1000);
  const t3Sla = calculateSlaDeadline(t3Created, "MEDIUM");

  const ticket3 = await Ticket.create({
    ticketNumber: "TC-74190",
    title: t3Title,
    description: t3Desc,
    category: "TECHNICAL",
    priority: "MEDIUM",
    status: "ESCALATED",
    customer: customer._id,
    assignedTo: undefined,
    slaHours: t3Sla.slaHours,
    slaDeadline: t3Sla.deadline,
    slaBreached: true,
    aiAnalysis: t3Ai,
    tags: ["database", "stale", "lag"],
    createdAt: t3Created,
  });

  await EscalationLog.create({
    ticketId: ticket3._id,
    triggeredBy: undefined,
    triggerType: "SLA_BREACH",
    fromStatus: "OPEN",
    toStatus: "ESCALATED",
    reason: "SLA window expired (24h limit breached). Ticket remained unaddressed.",
    createdAt: t3Sla.deadline,
  });

  // 4. Resolved Ticket
  const t4Title = "Assistance setting up SSO and SAML 2.0 with Okta";
  const t4Desc = "Please share the ACS URL and Entity ID metadata XML for our enterprise Okta tenant.";
  const t4Ai = analyzeTicketHeuristically({ title: t4Title, description: t4Desc });
  const t4Created = new Date(now.getTime() - 20 * 60 * 60 * 1000);
  const t4Sla = calculateSlaDeadline(t4Created, "LOW");
  const t4Resolved = new Date(now.getTime() - 8 * 60 * 60 * 1000);

  await Ticket.create({
    ticketNumber: "TC-62019",
    title: t4Title,
    description: t4Desc,
    category: "ACCOUNT",
    priority: "LOW",
    status: "RESOLVED",
    customer: customer._id,
    assignedTo: agent._id,
    slaHours: t4Sla.slaHours,
    slaDeadline: t4Sla.deadline,
    slaBreached: false,
    resolvedAt: t4Resolved,
    aiAnalysis: t4Ai,
    tags: ["sso", "saml", "okta"],
    createdAt: t4Created,
  });

  return {
    message: "MongoDB Atlas seeded with demo users and realistic tickets",
    credentials: {
      customer: { email: "customer@demo.com", password: "password123" },
      agent: { email: "agent@demo.com", password: "password123" },
      admin: { email: "admin@demo.com", password: "password123" },
    },
  };
}
