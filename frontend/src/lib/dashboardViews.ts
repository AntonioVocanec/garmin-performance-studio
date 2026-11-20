import { nutritionGroups, nutritionGroupFor, nutritionSectionIds } from "./nutritionViews";

type ViewId = "overview" | "performance" | "nutrition" | "lab";

const scrollBehavior = (): ScrollBehavior => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

const views: Array<{
  id: ViewId;
  label: string;
  title: string;
  description: string;
  links: Array<{ id: string; label: string }>;
}> = [
  {
    id: "overview",
    label: "Pregled",
    title: "Pregled dana",
    description: "Oporavak, san i današnji plan na jednom mjestu.",
    links: [
      { id: "health-overview", label: "Zdravlje" },
      { id: "daily-summary", label: "Danas ukratko" },
      { id: "activity-goals", label: "Aktivnost" },
      { id: "training-plan", label: "Sljedeći trening" },
    ],
  },
  {
    id: "performance",
    label: "Trening & Load",
    title: "Trening i izvedba",
    description: "Plan, opterećenje, trendovi i detalji aktivnosti.",
    links: [
      { id: "training-load", label: "Opterećenje" },
      { id: "training-patterns", label: "Kalendar" },
      { id: "performance-trends", label: "Trendovi" },
      { id: "garmin-performance-profile", label: "Forma i utrke" },
      { id: "weekly-review", label: "Tjedni osvrt" },
      { id: "plan-and-execution", label: "Plan i izvedba" },
      { id: "gear-overview", label: "Oprema" },
      { id: "activity-details", label: "Aktivnost" },
    ],
  },
  {
    id: "nutrition", label: "Prehrana", title: "Prehrana i oporavak",
    description: "Dnevni unos, nutritivni ciljevi i planiranje obroka.",
    links: nutritionGroups.map(({ primary, label }) => ({ id: primary.id, label })),
  },
  {
    id: "lab",
    label: "Laboratorij",
    title: "Laboratorij",
    description: "Dublji zdravstveni trendovi, mjerenja i osobni zapisi.",
    links: [
      { id: "skin-temperature", label: "Temperatura kože" },
      { id: "sleep-recovery", label: "San i oporavak" },
      { id: "garmin-measurements", label: "Mjerenja" },
      { id: "blood-labs", label: "Krvni nalazi" },
      { id: "correlation-lab", label: "Korelacije" },
      { id: "daily-check-in", label: "Dnevnik" },
      { id: "running-zones", label: "Trkačke zone" },
      { id: "data-sources", label: "Izvori" },
      { id: "lab-deep-dive", label: "Usporedbe" },
    ],
  },
];

const sectionIds: Record<string, string> = {
  "Danas ukratko": "daily-summary",
  "Plan i izvedba": "plan-and-execution",
  "Trčanje i running dynamics": "recent-activity-metrics",
  "Dnevni check-in": "daily-check-in",
  "Osobne trkačke zone": "running-zones",
  "Izvori podataka i dostupnost": "data-sources",
};

const sectionViews: Record<string, ViewId> = {
  ...Object.fromEntries(nutritionSectionIds.map(id => [id, "nutrition" as const])),
  "health-overview": "overview",
  "daily-summary": "overview",
  "activity-goals": "overview",
  "training-plan": "overview",
  "weekly-review": "performance",
  "plan-and-execution": "performance",
  "training-load": "performance",
  "training-patterns": "performance",
  "performance-trends": "performance",
  "garmin-performance-profile": "performance",
  "gear-overview": "performance",
  "activity-details": "performance",
  "recent-activity-metrics": "performance",
  "sleep-recovery": "lab",
  "skin-temperature": "lab",
  "garmin-measurements": "lab",
  "blood-labs": "lab",
  "daily-check-in": "lab",
  "running-zones": "lab",
  "data-sources": "lab",
  "correlation-lab": "lab",
  "lab-deep-dive": "lab",
};

function sectionId(section: HTMLElement): string {
  if (section.id) return section.id;
  const heading = section.querySelector("h2")?.textContent?.trim()
    ?? section.querySelector("details > summary strong")?.textContent?.trim()
    ?? "";
  const id = sectionIds[heading];
  if (id) section.id = id;
  return id ?? "";
}

export function initializeDashboardViews(): void {
  const main = document.querySelector<HTMLElement>("main.shell");
  const quickNav = main?.querySelector<HTMLElement>(":scope > .quick-nav");
  const quickNavLinks = quickNav?.querySelector<HTMLElement>(".quick-nav-links");
  const topbar = main?.querySelector<HTMLElement>(":scope > .topbar");
  const hero = main?.querySelector<HTMLElement>(":scope > .hero");
  const historyControl = main?.querySelector<HTMLElement>(":scope > #history-window-control");
  const skinTemperaturePanel = main?.querySelector<HTMLElement>("#skin-temperature");
  if (!main || !quickNav || !quickNavLinks || !topbar || !hero || main.querySelector(":scope > .dashboard-tabs")) return;

  const tabs = document.createElement("div");
  tabs.className = "dashboard-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Glavni pogledi dashboarda");

  const panels = new Map<ViewId, HTMLElement>();
  const tabButtons = new Map<ViewId, HTMLButtonElement>();
  for (const [index, view] of views.entries()) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "dashboard-tab";
    tab.id = `dashboard-tab-${view.id}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `dashboard-view-${view.id}`);
    tab.setAttribute("aria-selected", String(index === 0));
    tab.tabIndex = index === 0 ? 0 : -1;
    tab.textContent = view.label;
    tabs.append(tab);
    tabButtons.set(view.id, tab);

    const panel = document.createElement("section");
    panel.className = "dashboard-view";
    panel.id = `dashboard-view-${view.id}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    panel.tabIndex = -1;
    panel.hidden = index !== 0;

    const heading = document.createElement("header");
    heading.className = "dashboard-view-heading";
    heading.innerHTML = `<div><span class="eyebrow">${String(index + 1).padStart(2, "0")} / ${view.label}</span><h2>${view.title}</h2><p>${view.description}</p></div>`;
    if (view.id !== "nutrition") panel.append(heading);
    panels.set(view.id, panel);
  }

  const footer = main.querySelector<HTMLElement>(":scope > .footer");
  topbar.insertAdjacentElement("afterend", tabs);
  const initialSections = Array.from(main.children).filter((element): element is HTMLElement =>
    element instanceof HTMLElement && element.matches(".section"),
  );

  panels.get("overview")?.append(hero);
  const knownSectionIds = new Set(Object.keys(sectionViews));
  for (const section of initialSections) {
    const id = sectionId(section);
    if (!knownSectionIds.has(id)) continue;
    panels.get(sectionViews[id])?.append(section);
  }
  if (historyControl) panels.get("performance")?.prepend(historyControl);
  const labPanel = panels.get("lab");
  if (skinTemperaturePanel && labPanel) {
    const firstLabSection = labPanel.querySelector<HTMLElement>(":scope > .section");
    if (firstLabSection) labPanel.insertBefore(skinTemperaturePanel, firstLabSection);
    else labPanel.append(skinTemperaturePanel);
  }

  const sleepRecoverySection = labPanel?.querySelector<HTMLElement>("#sleep-recovery");
  if (sleepRecoverySection && !sleepRecoverySection.querySelector(":scope > .lab-recovery-tabs")) {
    const sleepGrid = sleepRecoverySection.querySelector<HTMLElement>(":scope > .layout-3");
    const sleepDebt = sleepGrid?.children.item(0) as HTMLElement | null;
    const sleepNight = sleepGrid?.children.item(1) as HTMLElement | null;
    const recoverySignals = sleepGrid?.children.item(2) as HTMLElement | null;
    const bodyBattery = sleepRecoverySection.querySelector<HTMLElement>("#body-battery-day");
    const directPanels = Array.from(sleepRecoverySection.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.matches(".panel"));
    const recoveryTrendPanel = directPanels.find(panel => panel.querySelector("#recovery-chart")) ?? null;
    const personalBaselinePanel = directPanels.find(panel => panel.querySelector("#baseline-hrv")) ?? null;
    const stressHeading = recoveryTrendPanel?.querySelector<HTMLElement>(".stress-trend-heading") ?? null;
    const stressChart = recoveryTrendPanel?.querySelector<HTMLElement>("#stress-trend-chart") ?? null;
    const stressNote = stressChart?.nextElementSibling instanceof HTMLElement ? stressChart.nextElementSibling : null;
    if (sleepGrid && sleepDebt && sleepNight && recoverySignals && bodyBattery && recoveryTrendPanel && personalBaselinePanel && stressHeading && stressChart) {
      const tabDefinitions = [
        { id: "sleep", label: "San", items: [sleepDebt, sleepNight] },
        { id: "recovery", label: "Oporavak", items: [recoverySignals, bodyBattery, recoveryTrendPanel] },
        { id: "stress", label: "Stres", items: [] as HTMLElement[] },
        { id: "baseline", label: "Osobna baza", items: [personalBaselinePanel] },
      ];
      const tabs = document.createElement("div");
      tabs.className = "lab-recovery-tabs";
      tabs.setAttribute("role", "tablist");
      tabs.setAttribute("aria-label", "Podkartice sna i oporavka");
      const content = document.createElement("div");
      content.className = "lab-recovery-content";
      const tabButtons = new Map<string, HTMLButtonElement>();
      const tabPanels = new Map<string, HTMLElement>();
      for (const [index, definition] of tabDefinitions.entries()) {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.id = `lab-recovery-tab-${definition.id}`;
        tab.className = "lab-recovery-tab";
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-controls", `lab-recovery-panel-${definition.id}`);
        tab.setAttribute("aria-selected", String(index === 0));
        tab.tabIndex = index === 0 ? 0 : -1;
        tab.textContent = definition.label;
        tabs.append(tab);
        tabButtons.set(definition.id, tab);

        const panel = document.createElement("section");
        panel.id = `lab-recovery-panel-${definition.id}`;
        panel.className = "lab-recovery-panel";
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", tab.id);
        panel.tabIndex = 0;
        panel.hidden = index !== 0;
        const grid = document.createElement("div");
        grid.className = "lab-recovery-grid";
        panel.append(grid);
        content.append(panel);
        tabPanels.set(definition.id, grid);
      }
      const stressPanel = tabPanels.get("stress")!;
      const stressCard = document.createElement("article");
      stressCard.className = "panel lab-recovery-wide";
      stressCard.append(stressHeading, stressChart);
      if (stressNote) stressCard.append(stressNote);
      tabPanels.get("sleep")!.append(...tabDefinitions[0].items);
      tabPanels.get("recovery")!.append(...tabDefinitions[1].items);
      stressPanel.append(stressCard);
      tabPanels.get("baseline")!.append(...tabDefinitions[3].items);
      bodyBattery.classList.add("lab-recovery-wide");
      recoveryTrendPanel.classList.add("lab-recovery-wide");
      personalBaselinePanel.classList.add("lab-recovery-wide");
      sleepGrid.remove();
      sleepRecoverySection.querySelector(":scope > .section-head")?.insertAdjacentElement("afterend", tabs);
      tabs.insertAdjacentElement("afterend", content);

      const activateLabTab = (id: string, focus = false) => {
        for (const definition of tabDefinitions) {
          const selected = definition.id === id;
          const button = tabButtons.get(definition.id)!;
          const panel = button.getAttribute("aria-controls");
          button.setAttribute("aria-selected", String(selected));
          button.tabIndex = selected ? 0 : -1;
          const panelElement = tabPanels.get(definition.id)?.parentElement;
          if (panelElement) panelElement.hidden = !selected;
          if (selected && focus) button.focus();
          if (selected && panel) requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
        }
      };
      tabs.addEventListener("click", event => {
        const button = (event.target as Element).closest<HTMLButtonElement>("[role=tab]");
        if (button) activateLabTab(button.id.replace("lab-recovery-tab-", ""));
      });
      tabs.addEventListener("keydown", event => {
        if (!(event instanceof KeyboardEvent)) return;
        const currentIndex = tabDefinitions.findIndex(item => tabButtons.get(item.id)?.getAttribute("aria-selected") === "true");
        const nextIndex = event.key === "ArrowRight" ? (currentIndex + 1) % tabDefinitions.length
          : event.key === "ArrowLeft" ? (currentIndex + tabDefinitions.length - 1) % tabDefinitions.length
            : event.key === "Home" ? 0 : event.key === "End" ? tabDefinitions.length - 1 : -1;
        if (nextIndex < 0) return;
        event.preventDefault();
        activateLabTab(tabDefinitions[nextIndex].id, true);
      });
    }
  }

  if (labPanel) {
    const labDeepDive = document.createElement("section");
    labDeepDive.className = "section lab-deep-dive-section";
    labDeepDive.id = "lab-deep-dive";
    labDeepDive.innerHTML = '<div class="section-head"><h2>Dublje usporedbe i tablice</h2><span class="section-note">Detaljni pregled treninga i njegovih izvora</span></div><div class="lab-analytics-grid"></div>';
    const analyticsGrid = labDeepDive.querySelector<HTMLElement>(".lab-analytics-grid")!;
    const detailedPanels = [
      panels.get("performance")?.querySelector<HTMLElement>(".monthly-review-panel"),
      panels.get("performance")?.querySelector<HTMLElement>(".performance-dynamics"),
      panels.get("performance")?.querySelector<HTMLElement>(".sport-balance-panel"),
      panels.get("performance")?.querySelector<HTMLElement>(".hr-zone-comparison-panel"),
    ].filter((panel): panel is HTMLElement => Boolean(panel));
    detailedPanels.forEach((panel) => analyticsGrid.append(panel));
    if (detailedPanels.length) {
      labPanel.append(labDeepDive);
    }
  }

  const performancePanel = panels.get("performance");
  const trainingLoadSection = performancePanel?.querySelector<HTMLElement>("#training-load");
  const trainingLoadGrid = trainingLoadSection?.querySelector<HTMLElement>(":scope > .layout-3");
  const loadRatioCard = trainingLoadSection?.querySelector<HTMLElement>("#load-ring")?.closest<HTMLElement>(".panel");
  const trainingStatusCard = trainingLoadSection?.querySelector<HTMLElement>("#garmin-training-status")?.closest<HTMLElement>(".garmin-performance-card");
  const runningToleranceCard = trainingLoadSection?.querySelector<HTMLElement>("#running-tolerance-load")?.closest<HTMLElement>(".garmin-performance-card");
  if (trainingLoadSection && trainingLoadGrid && loadRatioCard && trainingStatusCard && runningToleranceCard) {
    const priorityGrid = document.createElement("div");
    priorityGrid.className = "load-priority-grid";
    priorityGrid.setAttribute("aria-label", "Najvažnije metrike statusa i opterećenja");
    priorityGrid.append(trainingStatusCard, loadRatioCard, runningToleranceCard);
    trainingLoadSection.insertBefore(priorityGrid, trainingLoadGrid);
    trainingLoadGrid.classList.replace("layout-3", "layout-2");
  }

  if (performancePanel) {
    const orderedSections = [
      "training-load", "training-patterns", "performance-trends", "garmin-performance-profile",
      "weekly-review", "plan-and-execution", "gear-overview", "activity-details",
    ];
    for (const id of orderedSections) {
      const section = performancePanel.querySelector<HTMLElement>(`#${id}`);
      if (section) performancePanel.append(section);
    }
  }

  const createDisclosureGroup = (
    owner: HTMLElement | null | undefined,
    id: string,
    title: string,
    description: string,
    sectionIdsToGroup: string[],
  ): HTMLDetailsElement | null => {
    if (!owner) return null;
    const sections = sectionIdsToGroup
      .map((sectionId) => owner.querySelector<HTMLElement>(`#${CSS.escape(sectionId)}`))
      .filter((section): section is HTMLElement => Boolean(section));
    if (!sections.length) return null;

    const details = document.createElement("details");
    details.className = "section-disclosure";
    details.id = id;
    const summary = document.createElement("summary");
    summary.className = "section-disclosure-summary";
    const heading = document.createElement("span");
    heading.className = "section-disclosure-heading";
    const titleElement = document.createElement("span");
    titleElement.setAttribute("role", "heading");
    titleElement.setAttribute("aria-level", "2");
    titleElement.className = "section-disclosure-title";
    titleElement.textContent = title;
    const descriptionElement = document.createElement("span");
    descriptionElement.className = "section-note";
    descriptionElement.textContent = description;
    heading.append(titleElement, descriptionElement);
    const badge = document.createElement("span");
    badge.className = "badge section-disclosure-state";
    badge.textContent = "Otvori";
    summary.setAttribute("aria-controls", `${id}-content`);
    summary.append(heading, badge);
    const content = document.createElement("div");
    content.className = "section-disclosure-content";
    content.id = `${id}-content`;
    details.append(summary, content);
    sections[0].insertAdjacentElement("beforebegin", details);
    content.append(...sections);
    details.addEventListener("toggle", () => {
      badge.textContent = details.open ? "Sklopi" : "Otvori";
      if (details.open) requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    });
    return details;
  };

  createDisclosureGroup(
    performancePanel,
    "performance-trends-disclosure",
    "Trendovi i forma",
    "Godišnji napredak, Garminove procjene, utrke i osobni rekordi.",
    ["performance-trends", "garmin-performance-profile"],
  );
  createDisclosureGroup(
    performancePanel,
    "weekly-plan-disclosure",
    "Tjedni osvrt i plan",
    "Tjedni kontekst, Runna plan i usporedba planiranog s izvedenim.",
    ["weekly-review", "plan-and-execution"],
  );
  createDisclosureGroup(
    performancePanel,
    "gear-activity-disclosure",
    "Oprema i aktivnosti",
    "Istrošenost opreme i detalji odabranih Garmin aktivnosti.",
    ["gear-overview", "activity-details"],
  );
  createDisclosureGroup(
    labPanel,
    "measurements-disclosure",
    "Tjelesna mjerenja",
    "Vaganja i ECG očitanja iz Garmin Connecta.",
    ["garmin-measurements"],
  );
  createDisclosureGroup(
    labPanel,
    "advanced-analytics-disclosure",
    "Napredna analitika",
    "Korelacije, usporedbe razdoblja i detaljne tablice.",
    ["correlation-lab", "lab-deep-dive"],
  );
  createDisclosureGroup(
    labPanel,
    "journal-sources-disclosure",
    "Dnevnik i izvori podataka",
    "Osobni check-in, trkačke zone i dostupnost Garmin izvora.",
    ["daily-check-in", "running-zones", "data-sources"],
  );

  for (const view of views) {
    const panel = panels.get(view.id);
    if (panel) main.insertBefore(panel, footer ?? null);
  }

  quickNavLinks.replaceChildren();
  for (const view of views) {
    const orderedLinks = view.links
      .map((link, order) => {
        const target = main.querySelector<HTMLElement>(`#${CSS.escape(link.id)}`) ?? (view.id === "nutrition" ? panels.get("nutrition") : null);
        return { link, order, section: target?.closest<HTMLElement>(".section") ?? target };
      })
      .filter((item): item is typeof item & { section: HTMLElement } => Boolean(item.section))
      .sort((a, b) => {
        if (view.id === "nutrition") return a.order - b.order;
        if (a.section === b.section) return a.order - b.order;
        const position = a.section.compareDocumentPosition(b.section);
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return a.order - b.order;
      });

    orderedLinks.forEach(({ link }, index) => {
      const anchor = document.createElement("a");
      anchor.href = `#${link.id}`;
      anchor.dataset.dashboardView = view.id;
      if (view.id === "nutrition") anchor.textContent = link.label;
      else anchor.innerHTML = `<span class="quick-nav-index">${String(index + 1).padStart(2, "0")}</span>${link.label}`;
      quickNavLinks.append(anchor);
    });
  }

  quickNav.querySelector(".quick-nav-intro b")!.textContent = "Sekcije";
  quickNav.querySelector(".quick-nav-intro small")!.textContent = "Skok na odjeljak";

  const revealCollapsedTarget = (targetId: string) => {
    const target = document.getElementById(targetId);
    if (!target) return;
    let disclosure = target.closest<HTMLDetailsElement>("details");
    while (disclosure) {
      disclosure.open = true;
      disclosure = disclosure.parentElement?.closest<HTMLDetailsElement>("details") ?? null;
    }
    target.querySelectorAll<HTMLDetailsElement>(":scope > details:not([open])").forEach((nested) => {
      nested.open = true;
    });
  };

  let activeView: ViewId = "overview";
  const viewFromHash = (hash: string): ViewId | null => {
    const match = hash.match(/^#view-(overview|performance|nutrition|lab)$/);
    return match ? match[1] as ViewId : null;
  };
  const setCurrentSection = (targetId: string | null) => {
    const nutritionActive = targetId ? sectionViews[targetId] === "nutrition" : location.hash === "#view-nutrition";
    const currentId = nutritionActive ? nutritionGroupFor(targetId ?? "").primary.id : targetId;
    for (const anchor of quickNavLinks.querySelectorAll<HTMLAnchorElement>("a[data-dashboard-view]")) {
      if (currentId && anchor.hash === `#${encodeURIComponent(currentId)}`) {
        anchor.setAttribute("aria-current", "location");
        quickNavLinks.scrollTo({
          left: Math.max(0, quickNavLinks.scrollLeft + anchor.getBoundingClientRect().left
            - quickNavLinks.getBoundingClientRect().left - (quickNavLinks.clientWidth - anchor.clientWidth) / 2),
          behavior: scrollBehavior(),
        });
      } else anchor.removeAttribute("aria-current");
    }
  };
  window.addEventListener("resize",()=>requestAnimationFrame(()=>{const current=quickNavLinks.querySelector<HTMLAnchorElement>('a[aria-current="location"]');if(current)setCurrentSection(decodeURIComponent(current.hash.slice(1)))}));
  const sectionTargets = new Map<ViewId, string[]>();
  for (const view of views) sectionTargets.set(view.id, view.links.map(({ id }) => id));
  const writeViewHash = (viewId: ViewId, replace = false) => {
    const hash = `#view-${viewId}`;
    if (location.hash === hash) return;
    history[replace ? "replaceState" : "pushState"]({ dashboardView: viewId }, "", hash);
  };
  const scrollToDashboardTarget = (target: HTMLElement | null) => {
    if (!target) return;
    const stickyOffset = Math.ceil(tabs.getBoundingClientRect().height + quickNav.getBoundingClientRect().height + 12);
    const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - stickyOffset);
    window.scrollTo({ top, behavior: scrollBehavior() });
  };
  window.addEventListener("dashboard:content-updated", () => {
    let targetId = "";
    try { targetId = decodeURIComponent(location.hash.slice(1)); } catch { targetId = location.hash.slice(1); }
    if (!sectionViews[targetId]) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      revealCollapsedTarget(targetId);
      scrollToDashboardTarget(document.getElementById(targetId));
    }));
  });
  let userScrollIntent = false;
  let scrollFrame = 0;
  const noteUserScroll = () => { userScrollIntent = true; };
  window.addEventListener("wheel", noteUserScroll, { passive: true });
  window.addEventListener("touchmove", noteUserScroll, { passive: true });
  window.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) noteUserScroll();
  });
  window.addEventListener("scroll", () => {
    if (!userScrollIntent || scrollFrame || activeView === "nutrition") return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      const panel = panels.get(activeView);
      if (!panel) return;
      const stickyBottom = Math.max(tabs.getBoundingClientRect().bottom, quickNav.getBoundingClientRect().bottom) + 8;
      const visibleTargets = (sectionTargets.get(activeView) ?? [])
        .map(id => document.getElementById(id))
        .filter((target): target is HTMLElement => Boolean(target && panel.contains(target) && target.getClientRects().length && (!target.closest("details") || target.closest<HTMLDetailsElement>("details")?.open)));
      if (!visibleTargets.length) return;
      const current = visibleTargets.filter(target => target.getBoundingClientRect().top <= stickyBottom + 24).at(-1)
        ?? visibleTargets.reduce((nearest, target) => Math.abs(target.getBoundingClientRect().top - stickyBottom) < Math.abs(nearest.getBoundingClientRect().top - stickyBottom) ? target : nearest);
      setCurrentSection(current.id);
    });
  }, { passive: true });
  const activateView = (viewId: ViewId, scrollToPanel = false) => {
    activeView = viewId;
    for (const view of views) {
      const selected = view.id === activeView;
      const panel = panels.get(view.id);
      const tab = tabButtons.get(view.id);
      if (panel) panel.hidden = !selected;
      if (tab) {
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
      }
    }
    for (const anchor of quickNavLinks.querySelectorAll<HTMLAnchorElement>("a[data-dashboard-view]")) {
      anchor.hidden = anchor.dataset.dashboardView !== activeView;
    }
    if (scrollToPanel) {
      requestAnimationFrame(() => scrollToDashboardTarget(panels.get(activeView) ?? null));
    }
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    main.dataset.activeView = activeView;
    window.dispatchEvent(new CustomEvent("dashboard:navigation", {detail:{view:activeView,hash:location.hash}}));
  };

  for (const [viewId, tab] of tabButtons) {
    tab.addEventListener("click", () => {
      writeViewHash(viewId);
      setCurrentSection(null);
      activateView(viewId, true);
    });
  }
  tabs.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent)) return;
    const selectedIndex = views.findIndex((view) => view.id === activeView);
    const nextIndex = event.key === "ArrowRight"
      ? (selectedIndex + 1) % views.length
      : event.key === "ArrowLeft"
        ? (selectedIndex + views.length - 1) % views.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? views.length - 1
            : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = views[nextIndex];
    writeViewHash(next.id);
    setCurrentSection(null);
    activateView(next.id, true);
    tabButtons.get(next.id)?.focus();
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest<HTMLAnchorElement>('a[href^="#"]');
    if (!anchor) return;
    const targetId = decodeURIComponent(anchor.hash.slice(1));
    const nextView = sectionViews[targetId];
    if (!nextView) return;
    event.preventDefault();
    const hash = `#${encodeURIComponent(targetId)}`;
    if (location.hash !== hash) history.pushState({ dashboardSection: targetId }, "", hash);
    if (nextView !== activeView) activateView(nextView);
    window.dispatchEvent(new CustomEvent("dashboard:navigation", {detail:{view:activeView,hash:location.hash}}));
    setCurrentSection(targetId);
    revealCollapsedTarget(targetId);
    requestAnimationFrame(() => scrollToDashboardTarget(document.getElementById(targetId) ?? (nextView === "nutrition" ? panels.get("nutrition") ?? null : null)));
  });

  const restoreLocation = () => {
    let targetId = "";
    try { targetId = decodeURIComponent(location.hash.slice(1)); } catch { targetId = location.hash.slice(1); }
    const targetView = sectionViews[targetId];
    if (targetView) {
      activateView(targetView);
      setCurrentSection(targetId);
      revealCollapsedTarget(targetId);
      requestAnimationFrame(() => scrollToDashboardTarget(document.getElementById(targetId) ?? (targetView === "nutrition" ? panels.get("nutrition") ?? null : null)));
      return;
    }
    const hashView = viewFromHash(location.hash);
    const viewId = hashView ?? "overview";
    setCurrentSection(null);
    activateView(viewId, Boolean(hashView));
  };
  window.addEventListener("popstate", restoreLocation);
  restoreLocation();
}
