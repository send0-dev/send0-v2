import { pluralize } from "@/lib/format";

export const eventSummary = (events: string[]) => (events.includes("*") ? "All events" : events.length <= 2 ? events.join(", ") : pluralize(events.length, "event"));
