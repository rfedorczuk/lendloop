import { ConvexError } from "convex/values";

// Loans work on calendar days, stored as YYYY-MM-DD strings. Strings in this
// format sort the same way as the dates they stand for, so they can be
// compared directly and used in index ranges.

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export const MAX_LOAN_DAYS = 30;
export const MAX_DAYS_AHEAD = 365;

export function today(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function toUtc(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

export function isValidDay(day: string): boolean {
  if (!ISO_DAY.test(day)) return false;
  const time = toUtc(day);
  // Rejects strings like 2026-02-31, which Date would roll over to March.
  return !Number.isNaN(time) && today(time) === day;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

export function assertLoanPeriod(
  startDate: string,
  endDate: string,
  now: number = Date.now(),
): void {
  if (!isValidDay(startDate) || !isValidDay(endDate)) {
    throw new ConvexError("Dates must be valid calendar days.");
  }
  if (startDate < today(now)) {
    throw new ConvexError("The loan cannot start in the past.");
  }
  if (daysBetween(today(now), startDate) > MAX_DAYS_AHEAD) {
    throw new ConvexError("A loan can start at most a year from now.");
  }
  if (endDate < startDate) {
    throw new ConvexError("The return date must not be before the start date.");
  }
  if (daysBetween(startDate, endDate) + 1 > MAX_LOAN_DAYS) {
    throw new ConvexError(`A loan can last at most ${MAX_LOAN_DAYS} days.`);
  }
}

export function periodsOverlap(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string },
): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}
