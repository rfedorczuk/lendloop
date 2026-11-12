import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "decline requests whose dates have passed",
  { hourUTC: 0, minuteUTC: 15 },
  internal.maintenance.expireRequests,
);

crons.interval(
  "fail events stuck in delivery",
  { hours: 1 },
  internal.maintenance.failStuckEvents,
);

export default crons;
