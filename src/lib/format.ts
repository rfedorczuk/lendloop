import { ConvexError } from "convex/values";

export const CATEGORIES = [
  ["power_tools", "Power tools"],
  ["hand_tools", "Hand tools"],
  ["garden", "Garden"],
  ["kitchen", "Kitchen"],
  ["camping", "Camping"],
  ["cleaning", "Cleaning"],
  ["other", "Other"],
] as const;

export const CONDITIONS = [
  ["like_new", "Like new"],
  ["good", "Good"],
  ["worn", "Worn but works"],
] as const;

export type Category = (typeof CATEGORIES)[number][0];
export type Condition = (typeof CONDITIONS)[number][0];

export function categoryLabel(value: Category): string {
  return CATEGORIES.find(([key]) => key === value)![1];
}

export function conditionLabel(value: Condition): string {
  return CONDITIONS.find(([key]) => key === value)![1];
}

// The server works in UTC days, so the client offers the same "today".
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function timeAgo(timestamp: number, now: number = Date.now()): string {
  const minutes = Math.round((now - timestamp) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

// Convex functions throw ConvexError with a message meant for the user.
// Anything else is a bug or an outage, and the details stay in the logs.
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return "Something went wrong. Please try again.";
}
