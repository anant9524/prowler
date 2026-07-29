import type { IconComponent } from "@/types";

export const APP_SIDEBAR_MODE = {
  BROWSE: "browse",
  CHAT: "chat",
} as const;

export type AppSidebarMode =
  (typeof APP_SIDEBAR_MODE)[keyof typeof APP_SIDEBAR_MODE];

export const NAVIGATION_ITEM_KIND = {
  LINK: "link",
  COLLAPSIBLE: "collapsible",
} as const;

export const NAVIGATION_PERMISSION = {
  MANAGE_BILLING: "manage_billing",
  MANAGE_INTEGRATIONS: "manage_integrations",
} as const;

export type NavigationPermission =
  (typeof NAVIGATION_PERMISSION)[keyof typeof NAVIGATION_PERMISSION];

interface NavigationLabel {
  label: string;
  requiredPermission?: NavigationPermission;
}

export interface NavigationLink extends NavigationLabel {
  kind: typeof NAVIGATION_ITEM_KIND.LINK;
  href: string;
  icon: IconComponent;
  active?: boolean;
  highlight?: boolean;
  target?: string;
  tooltip?: string;
}

export interface NavigationChildLink extends NavigationLabel {
  kind: typeof NAVIGATION_ITEM_KIND.LINK;
  href: string;
  active?: boolean;
  disabled?: boolean;
  highlight?: boolean;
  target?: string;
}

export type NavigationChild = NavigationChildLink;

export interface NavigationCollapsible extends NavigationLabel {
  kind: typeof NAVIGATION_ITEM_KIND.COLLAPSIBLE;
  icon: IconComponent;
  children: NavigationChild[];
  defaultOpen: boolean;
}

export type NavigationItem = NavigationLink | NavigationCollapsible;

export interface NavigationSection {
  label?: string;
  items: NavigationItem[];
}

export type AppSidebarSelectionHandler = () => HTMLElement | null;
