import type { ViewType } from '../components/NavigationBar';

export const panelImporters = {
  prompts: () => import('../components/PromptsPanel'),
  skills: () => import('../components/SkillsPanel'),
  agents: () => import('../components/AgentsPanel'),
  config: () => import('../components/ConfigPanel'),
  gateway: () => import('../components/GatewayPanel'),
} as const;

type PanelView = Exclude<ViewType, 'accounts'>;

const prefetchedPanels = new Set<PanelView>();

export function preloadPanel(view: PanelView): void {
  if (prefetchedPanels.has(view)) {
    return;
  }
  prefetchedPanels.add(view);
  void panelImporters[view]();
}
