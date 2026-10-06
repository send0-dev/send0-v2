/**
 * The workspace this tab is showing. Every request carries it, so if the session switched to
 * another workspace (in another tab, or because this person was removed) the server refuses
 * with 409 workspace_changed instead of quietly acting on the wrong workspace.
 */
export const WORKSPACE_HEADER = "x-send0-workspace";

let current: string | null = null;

export const activeWorkspace = () => current;
export const setActiveWorkspace = (id: string | null) => {
  current = id;
};

export const workspaceHeaders = (): Record<string, string> => (current ? { [WORKSPACE_HEADER]: current } : {});
