import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface ITicketComment extends Document {
  ticketId: Types.ObjectId;
  author: Types.ObjectId;
  message: string;
  isInternalNote: boolean;
  isAiGenerated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TicketCommentSchema = new Schema<ITicketComment>(
  {
    ticketId: {
      type: Schema.Types.ObjectId,
      ref: "Ticket",
      required: true,
      index: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: {
      type: String,
      required: [true, "Message is required"],
      trim: true,
    },
    isInternalNote: {
      type: Boolean,
      default: false,
    },
    isAiGenerated: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const TicketComment: Model<ITicketComment> =
  mongoose.models.TicketComment ||
  mongoose.model<ITicketComment>("TicketComment", TicketCommentSchema);
