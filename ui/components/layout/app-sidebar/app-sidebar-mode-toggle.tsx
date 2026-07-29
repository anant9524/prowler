"use client";

import { Home } from "lucide-react";
import { useRouter } from "next/navigation";

import { LighthouseIcon } from "@/components/icons/Icons";
import { NavigationButton } from "@/components/shadcn/navigation-button";

import { useAppSidebarMode } from "./app-sidebar-mode-store";
import {
  APP_SIDEBAR_MODE,
  type AppSidebarMode,
  type AppSidebarSelectionHandler,
} from "./types";

interface AppSidebarModeToggleProps {
  onSelect?: AppSidebarSelectionHandler;
}

const MODES = [
  {
    value: APP_SIDEBAR_MODE.BROWSE,
    label: "Home",
    icon: Home,
  },
  {
    value: APP_SIDEBAR_MODE.CHAT,
    label: "Chat",
    icon: LighthouseIcon,
  },
] as const;

export function AppSidebarModeToggle({ onSelect }: AppSidebarModeToggleProps) {
  const router = useRouter();
  const mode = useAppSidebarMode((state) => state.mode);
  const setMode = useAppSidebarMode((state) => state.setMode);
  const selectMode = (nextMode: AppSidebarMode) => {
    setMode(nextMode);
    onSelect?.();

    if (nextMode === APP_SIDEBAR_MODE.CHAT) {
      router.push("/lighthouse");
    } else if (nextMode === APP_SIDEBAR_MODE.BROWSE) {
      router.push("/");
    }
  };

  return (
    <div
      role="group"
      aria-label="Sidebar view"
      className="border-border-sidebar-toggle bg-bg-sidebar-toggle grid grid-cols-2 gap-1 rounded-xl border p-1"
    >
      {MODES.map((item) => {
        const Icon = item.icon;
        const isActive = item.value === mode;
        return (
          <NavigationButton
            key={item.value}
            variant="toggle"
            active={isActive}
            aria-label={item.label}
            aria-pressed={isActive}
            onClick={() => selectMode(item.value)}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <span>{item.label}</span>
          </NavigationButton>
        );
      })}
    </div>
  );
}
