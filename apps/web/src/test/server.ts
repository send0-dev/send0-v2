import { setupServer } from "msw/node";

/** One MSW server for the UI tests. Each test adds the handlers it needs with server.use(). */
export const server = setupServer();
