import mongoose, { Schema, Document, Model } from "mongoose";

export type UserRole = "CUSTOMER" | "AGENT" | "ADMIN";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash?: string;
  firebaseUid?: string;
  authProvider: "LOCAL" | "GOOGLE" | "FIREBASE";
  role: UserRole;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      default: "",
    },
    firebaseUid: {
      type: String,
      default: "",
      index: true,
    },
    authProvider: {
      type: String,
      enum: ["LOCAL", "GOOGLE", "FIREBASE"],
      default: "LOCAL",
    },
    role: {
      type: String,
      enum: ["CUSTOMER", "AGENT", "ADMIN"],
      default: "CUSTOMER",
      index: true,
    },
    avatarUrl: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
