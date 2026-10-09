const NEXT = new Set(["ArrowRight", "ArrowDown"]);
const PREV = new Set(["ArrowLeft", "ArrowUp"]);

for (const list of document.querySelectorAll<HTMLElement>("[data-tabs]")) {
  const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
  const select = (i: number, focus = false) => {
    tabs.forEach((tab, j) => {
      const on = i === j;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
      if (panel) panel.hidden = !on;
    });
    if (focus) tabs[i]?.focus();
  };
  list.addEventListener("click", (e) => {
    const i = tabs.indexOf((e.target as Element).closest('[role="tab"]') as HTMLElement);
    if (i >= 0) select(i);
  });
  list.addEventListener("keydown", (e) => {
    const i = tabs.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const n = tabs.length;
    const to = NEXT.has(e.key) ? (i + 1) % n : PREV.has(e.key) ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    select(to, true);
  });
}
