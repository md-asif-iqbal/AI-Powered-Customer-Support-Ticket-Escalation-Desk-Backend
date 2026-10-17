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

  const customerEmma = await User.findOneAndUpdate(
    { email: "emma.customer@demo.com" },
    {
      name: "Emma Watson",
      email: "emma.customer@demo.com",
      passwordHash: demoPasswordHash,
      role: "CUSTOMER",
      authProvider: "LOCAL",
    },
    { upsert: true, new: true }
  );

  const customerDavid = await User.findOneAndUpdate(
    { email: "david.customer@demo.com" },
    {
      name: "David Miller",
      email: "david.customer@demo.com",
      passwordHash: demoPasswordHash,
      role: "CUSTOMER",
      authProvider: "LOCAL",
    },
    { upsert: true, new: true }
  );

  const customerSophia = await User.findOneAndUpdate(
    { email: "sophia.customer@demo.com" },
    {
      name: "Sophia Chen",
      email: "sophia.customer@demo.com",
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

  const agentMarcus = await User.findOneAndUpdate(
    { email: "marcus.agent@demo.com" },
    {
      name: "Marcus Vance",
      email: "marcus.agent@demo.com",
      passwordHash: demoPasswordHash,
      role: "AGENT",
      authProvider: "LOCAL",
    },
    { upsert: true, new: true }
  );

  const agentPriya = await User.findOneAndUpdate(
    { email: "priya.agent@demo.com" },
    {
      name: "Priya Sharma",
      email: "priya.agent@demo.com",
      passwordHash: demoPasswordHash,
      role: "AGENT",
      authProvider: "LOCAL",
    },
    { upsert: true, new: true }
  );

  const admin = await User.findOneAndUpdate(
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

  // 1. Escalated Billing Outage (Multi-Agent Auto-Assigned by AI)
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
    assignedAgents: [agent._id, agentMarcus._id],
    slaHours: t1Sla.slaHours,
    slaDeadline: t1Sla.deadline,
    slaBreached: false,
    aiAnalysis: {
      ...t1Ai,
      autoAssigned: true,
      assignedAgentName: "Sarah Agent",
      assignedAgentNames: ["Sarah Agent (Lead)", "Marcus Vance (Co-Pilot)"],
    },
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
    notes: "Auto-escalated at ticket inception. Dual-agent assigned.",
    createdAt: t1Created,
  });

  await TicketComment.create({
    ticketId: ticket1._id,
    author: agent._id,
    message: "🤖 [AI Priority Auto-Assignment]: High-urgency issue detected. Assigned multi-agent team: Sarah Agent (Lead) & Marcus Vance (Co-Pilot) for rapid resolution.",
    isInternalNote: true,
    createdAt: t1Created,
  });

  await TicketComment.create({
    ticketId: ticket1._id,
    author: agent._id,
    message: "Investigating gateway server logs. Payment provider confirmed transient webhook latency spike. Reversal initiated.",
    isInternalNote: false,
    createdAt: new Date(t1Created.getTime() + 20 * 60 * 1000),
  });

  // 2. High Priority In Progress (Emma Watson - Assigned to Marcus Vance)
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
    customer: customerEmma._id,
    assignedTo: agentMarcus._id,
    assignedAgents: [agentMarcus._id],
    slaHours: t2Sla.slaHours,
    slaDeadline: t2Sla.deadline,
    slaBreached: false,
    aiAnalysis: {
      ...t2Ai,
      autoAssigned: true,
      assignedAgentName: "Marcus Vance",
      assignedAgentNames: ["Marcus Vance (Lead)"],
    },
    tags: ["api", "latency", "timeout"],
    createdAt: t2Created,
  });

  // 3. Breached Ticket (David Miller)
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
    customer: customerDavid._id,
    assignedTo: undefined,
    assignedAgents: [],
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

  // 4. Resolved Ticket (Emma Watson - Sarah Agent)
  const t4Title = "Assistance setting up SSO and SAML 2.0 with Okta";
  const t4Desc = "Please share the ACS URL and Entity ID metadata XML for our enterprise Okta tenant.";
  const t4Ai = analyzeTicketHeuristically({ title: t4Title, description: t4Desc });
  const t4Created = new Date(now.getTime() - 20 * 60 * 60 * 1000);
  const t4Sla = calculateSlaDeadline(t4Created, "LOW");
  const t4Resolved = new Date(now.getTime() - 18 * 60 * 60 * 1000);

  await Ticket.create({
    ticketNumber: "TC-62019",
    title: t4Title,
    description: t4Desc,
    category: "ACCOUNT",
    priority: "LOW",
    status: "RESOLVED",
    customer: customerEmma._id,
    assignedTo: agent._id,
    assignedAgents: [agent._id],
    slaHours: t4Sla.slaHours,
    slaDeadline: t4Sla.deadline,
    slaBreached: false,
    resolvedAt: t4Resolved,
    customerFeedback: {
      rating: 5,
      comment: "Sarah provided the metadata certificate and walked us through the Okta SAML connector seamlessly!",
      isReported: false,
      submittedAt: new Date(t4Resolved.getTime() + 15 * 60 * 1000),
    },
    aiAnalysis: t4Ai,
    tags: ["sso", "saml", "okta"],
    createdAt: t4Created,
  });

  // 5. Resolved Ticket (John Customer - Sarah Agent - Billing inquiry resolved in 1.4h)
  const t5Created = new Date(now.getTime() - 40 * 60 * 60 * 1000);
  const t5Sla = calculateSlaDeadline(t5Created, "MEDIUM");
  await Ticket.create({
    ticketNumber: "TC-55102",
    title: "Need updated invoice with VAT registration certificate number",
    description: "Our accounts department requires the official invoice receipt with tax registration number for March.",
    category: "BILLING",
    priority: "MEDIUM",
    status: "RESOLVED",
    customer: customer._id,
    assignedTo: agent._id,
    assignedAgents: [agent._id],
    slaHours: t5Sla.slaHours,
    slaDeadline: t5Sla.deadline,
    slaBreached: false,
    resolvedAt: new Date(t5Created.getTime() + 85 * 60 * 1000), // 1.4h
    customerFeedback: {
      rating: 5,
      comment: "Updated VAT invoice was delivered in under 2 hours. Excellent speed and courtesy!",
      isReported: false,
      submittedAt: new Date(t5Created.getTime() + 95 * 60 * 1000),
    },
    aiAnalysis: {
      sentiment: "POSITIVE",
      sentimentScore: 0.8,
      urgencyScore: 25,
      recommendedCategory: "BILLING",
      recommendedPriority: "MEDIUM",
      autoEscalateRecommended: false,
      escalationReason: "",
      suggestedReply: "Here is your updated corporate invoice attached.",
      keyIssues: ["invoice", "vat", "receipt"],
      modelUsed: "gemini-3.8-flash",
      analyzedAt: t5Created,
    },
    tags: ["invoice", "vat"],
    createdAt: t5Created,
  });

  // 6. Resolved Ticket (David Miller - Marcus Vance - Technical Bug resolved in 2.2h)
  const t6Created = new Date(now.getTime() - 50 * 60 * 60 * 1000);
  const t6Sla = calculateSlaDeadline(t6Created, "HIGH");
  await Ticket.create({
    ticketNumber: "TC-48219",
    title: "SSL Certificate renewal caused handshake rejection on legacy client",
    description: "Older cURL clients are failing handshake after the new TLS certificate was deployed yesterday.",
    category: "TECHNICAL",
    priority: "HIGH",
    status: "RESOLVED",
    customer: customerDavid._id,
    assignedTo: agentMarcus._id,
    assignedAgents: [agentMarcus._id],
    slaHours: t6Sla.slaHours,
    slaDeadline: t6Sla.deadline,
    slaBreached: false,
    resolvedAt: new Date(t6Created.getTime() + 130 * 60 * 1000), // 2.1h
    customerFeedback: {
      rating: 4,
      comment: "Marcus reconfigured the cipher fallback promptly and helped test our legacy staging servers.",
      isReported: false,
      submittedAt: new Date(t6Created.getTime() + 140 * 60 * 1000),
    },
    aiAnalysis: {
      sentiment: "NEUTRAL",
      sentimentScore: 0.2,
      urgencyScore: 60,
      recommendedCategory: "TECHNICAL",
      recommendedPriority: "HIGH",
      autoEscalateRecommended: false,
      escalationReason: "",
      suggestedReply: "Legacy cipher suite compatibility enabled on load balancer.",
      keyIssues: ["ssl", "tls", "handshake"],
      modelUsed: "gemini-3.8-flash",
      analyzedAt: t6Created,
    },
    tags: ["ssl", "tls"],
    createdAt: t6Created,
  });

  // 7. Resolved Ticket (Sophia Chen - Priya Sharma - Customer Query resolved in 45m)
  const t7Created = new Date(now.getTime() - 30 * 60 * 60 * 1000);
  const t7Sla = calculateSlaDeadline(t7Created, "LOW");
  await Ticket.create({
    ticketNumber: "TC-39108",
    title: "How to export complete customer activity history report in CSV format",
    description: "We want to export the past 6 months audit trail into Excel or CSV for compliance analysis.",
    category: "GENERAL",
    priority: "LOW",
    status: "RESOLVED",
    customer: customerSophia._id,
    assignedTo: agentPriya._id,
    assignedAgents: [agentPriya._id],
    slaHours: t7Sla.slaHours,
    slaDeadline: t7Sla.deadline,
    slaBreached: false,
    resolvedAt: new Date(t7Created.getTime() + 45 * 60 * 1000), // 0.75h
    customerFeedback: {
      rating: 5,
      comment: "Very swift response and crystal clear guidance. CSV was downloaded in seconds!",
      isReported: false,
      submittedAt: new Date(t7Created.getTime() + 50 * 60 * 1000),
    },
    aiAnalysis: {
      sentiment: "POSITIVE",
      sentimentScore: 0.9,
      urgencyScore: 15,
      recommendedCategory: "GENERAL",
      recommendedPriority: "LOW",
      autoEscalateRecommended: false,
      escalationReason: "",
      suggestedReply: "Navigate to Settings -> Audit Export to download your CSV file.",
      keyIssues: ["export", "csv", "audit"],
      modelUsed: "gemini-3.8-flash",
      analyzedAt: t7Created,
    },
    tags: ["export", "csv"],
    createdAt: t7Created,
  });

  // 8. Resolved Ticket (Sophia Chen - Alex Admin - Critical DNS resolution in 35m)
  const t8Created = new Date(now.getTime() - 72 * 60 * 60 * 1000);
  const t8Sla = calculateSlaDeadline(t8Created, "URGENT");
  await Ticket.create({
    ticketNumber: "TC-29184",
    title: "Apex domain DNS propagation stall during Cloudflare migration",
    description: "CNAME flattening record not resolving in Southeast Asia region after DNS nameserver update.",
    category: "TECHNICAL",
    priority: "URGENT",
    status: "RESOLVED",
    customer: customerSophia._id,
    assignedTo: admin._id,
    assignedAgents: [admin._id],
    slaHours: t8Sla.slaHours,
    slaDeadline: t8Sla.deadline,
    slaBreached: false,
    resolvedAt: new Date(t8Created.getTime() + 35 * 60 * 1000), // 0.6h
    customerFeedback: {
      rating: 5,
      comment: "Exceptional emergency assistance. Admin Alex resolved our DNS stall under 40 minutes.",
      isReported: false,
      submittedAt: new Date(t8Created.getTime() + 40 * 60 * 1000),
    },
    aiAnalysis: {
      sentiment: "POSITIVE",
      sentimentScore: 0.85,
      urgencyScore: 80,
      recommendedCategory: "TECHNICAL",
      recommendedPriority: "URGENT",
      autoEscalateRecommended: false,
      escalationReason: "",
      suggestedReply: "Cloudflare nameserver glue records refreshed.",
      keyIssues: ["dns", "cloudflare", "cname"],
      modelUsed: "gemini-3.8-flash",
      analyzedAt: t8Created,
    },
    tags: ["dns", "cloudflare"],
    createdAt: t8Created,
  });

  return {
    message: "MongoDB Atlas seeded with multi-agent support team & realistic service data!",
    credentials: {
      customer: { email: "customer@demo.com", password: "password123" },
      agentSarah: { email: "agent@demo.com", password: "password123" },
      agentMarcus: { email: "marcus.agent@demo.com", password: "password123" },
      agentPriya: { email: "priya.agent@demo.com", password: "password123" },
      adminAlex: { email: "admin@demo.com", password: "password123" },
    },
  };
}

// Allow direct CLI execution: tsx src/scripts/seed.ts
if (process.argv[1] && process.argv[1].includes("seed")) {
  import("../config/db.js").then(async ({ connectDB }) => {
    import("dotenv").then(async (dotenv) => {
      dotenv.config();
      await connectDB();
      const res = await runSeed();
      console.log("[Seed Finished]:", res);
      process.exit(0);
    });
  });
}

