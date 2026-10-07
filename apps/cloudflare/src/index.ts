import { createWorker } from "./worker";

/** Real-time hubs: one Durable Object per inbox and per org (SQLite-backed, on the free plan). */
export { Hub } from "@send0/api/realtime/hub-do";

/** send0 in one Worker: API, dashboard, inbound mail (Email Routing), webhook queue and cron. */
export default createWorker();
