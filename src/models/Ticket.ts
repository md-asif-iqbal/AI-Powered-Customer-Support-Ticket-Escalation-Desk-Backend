import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type TicketCategory = "TECHNICAL" | "BILLING" | "ACCOUNT" | "GENERAL";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TicketStatus = "OPEN" | "IN_PROGRESS" | "ESCALATED" | "RESOLVED" | "CLOSED";

export interface IAiAnalysis {
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "FRUSTRATED";
  sentimentScore: number;
  urgencyScore: number;
  recommendedCategory: TicketCategory;
  recommendedPriority: TicketPriority;
  autoEscalateRecommended: boolean;
  escalationReason: string;
  suggestedReply: string;
  keyIssues: string[];
  autoAssigned?: boolean;
  assignedAgentName?: string;
  assignedAgentNames?: string[];
  modelUsed: string;
  analyzedAt: Date;
}

export interface ICustomerFeedback {
  rating: number; // 1-5
  comment?: string;
  isReported?: boolean;
  reportReason?: string;
  submittedAt: Date;
}

export interface ITicket extends Document {
  ticketNumber: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  customer: Types.ObjectId;
  assignedTo?: Types.ObjectId | null;
  assignedAgents?: Types.ObjectId[];
  slaHours: number;
  slaDeadline: Date;
  slaBreached: boolean;
  lastAssignedAt?: Date;
  reassignmentCount?: number;
  firstResponseAt?: Date | null;
  firstResponseBreached?: boolean;
  resolvedAt?: Date | null;
  closedAt?: Date | null;
  tags: string[];
  aiAnalysis?: IAiAnalysis;
  customerFeedback?: ICustomerFeedback;
  createdAt: Date;
  updatedAt: Date;
}

const AiAnalysisSchema = new Schema<IAiAnalysis>(
  {
    sentiment: {
      type: String,
      enum: ["POSITIVE", "NEUTRAL", "NEGATIVE", "FRUSTRATED"],
      default: "NEUTRAL",
    },
    sentimentScore: { type: Number, default: 0 },
    urgencyScore: { type: Number, default: 50 },
    recommendedCategory: {
      type: String,
      enum: ["TECHNICAL", "BILLING", "ACCOUNT", "GENERAL"],
      default: "GENERAL",
    },
    recommendedPriority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      default: "MEDIUM",
    },
    autoEscalateRecommended: { type: Boolean, default: false },
    escalationReason: { type: String, default: "" },
    suggestedReply: { type: String, default: "" },
    keyIssues: { type: [String], default: [] },
    autoAssigned: { type: Boolean, default: false },
    assignedAgentName: { type: String, default: "" },
    assignedAgentNames: { type: [String], default: [] },
    modelUsed: { type: String, default: "gemini-3.8-flash" },
    analyzedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const TicketSchema = new Schema<ITicket>(
  {
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, "Ticket title is required"],
      trim: true,
      maxlength: [180, "Title cannot exceed 180 characters"],
    },
    description: {
      type: String,
      required: [true, "Ticket description is required"],
      trim: true,
    },
    category: {
      type: String,
      enum: ["TECHNICAL", "BILLING", "ACCOUNT", "GENERAL"],
      default: "GENERAL",
      index: true,
    },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      default: "MEDIUM",
      index: true,
    },
    status: {
      type: String,
      enum: ["OPEN", "IN_PROGRESS", "ESCALATED", "RESOLVED", "CLOSED"],
      default: "OPEN",
      index: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    assignedAgents: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    slaHours: {
      type: Number,
      required: true,
      default: 24,
    },
    slaDeadline: {
      type: Date,
      required: true,
      index: true,
    },
    slaBreached: {
      type: Boolean,
      default: false,
      index: true,
    },
    lastAssignedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    reassignmentCount: {
      type: Number,
      default: 0,
    },
    firstResponseAt: {
      type: Date,
      default: null,
    },
    firstResponseBreached: {
      type: Boolean,
      default: false,
      index: true,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    tags: {
      type: [String],
      default: [],
    },
    aiAnalysis: {
      type: AiAnalysisSchema,
      default: null,
    },
    customerFeedback: {
      rating: { type: Number, min: 1, max: 5 },
      comment: { type: String, default: "" },
      isReported: { type: Boolean, default: false },
      reportReason: { type: String, default: "" },
      submittedAt: { type: Date },
    },
  },
  {
    timestamps: true,
  }
);

export const Ticket: Model<ITicket> =
  mongoose.models.Ticket || mongoose.model<ITicket>("Ticket", TicketSchema);
