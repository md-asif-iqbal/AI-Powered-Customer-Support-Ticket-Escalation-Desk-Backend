import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { TicketStatus } from "./Ticket.js";

export type EscalationTriggerType =
  | "MANUAL"
  | "AI_SENTIMENT"
  | "SLA_BREACH"
  | "SYSTEM_RULE";

export interface IEscalationLog extends Document {
  ticketId: Types.ObjectId;
  triggeredBy?: Types.ObjectId | null;
  triggerType: EscalationTriggerType;
  fromStatus: TicketStatus;
  toStatus: TicketStatus;
  reason: string;
  notes?: string;
  createdAt: Date;
}

const EscalationLogSchema = new Schema<IEscalationLog>(
  {
    ticketId: {
      type: Schema.Types.ObjectId,
      ref: "Ticket",
      required: true,
      index: true,
    },
    triggeredBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    triggerType: {
      type: String,
      enum: ["MANUAL", "AI_SENTIMENT", "SLA_BREACH", "SYSTEM_RULE"],
      required: true,
      index: true,
    },
    fromStatus: {
      type: String,
      required: true,
    },
    toStatus: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const EscalationLog: Model<IEscalationLog> =
  mongoose.models.EscalationLog ||
  mongoose.model<IEscalationLog>("EscalationLog", EscalationLogSchema);
