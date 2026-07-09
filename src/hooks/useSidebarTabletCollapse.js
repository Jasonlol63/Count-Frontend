import { useCallback, useEffect, useState } from "react";

export const SIDEBAR_COLLAPSED_STORAGE_KEY = "ec_sidebar_collapsed";
/** iPad / Galaxy Tab 横屏等平板视口 */
export const TABLET_MEDIA_QUERY = "(max-width: 1280px)";

export function useSidebarTabletCollapse() {
  const [isTabletViewport, setIsTabletViewport] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(TABLET_MEDIA_QUERY).matches : false,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
    return window.matchMedia(TABLET_MEDIA_QUERY).matches;
  });

  const sidebarIconOnly = isTabletViewport && sidebarCollapsed;
  const sidebarTabletExpanded = isTabletViewport && !sidebarCollapsed;

  useEffect(() => {
    const mq = window.matchMedia(TABLET_MEDIA_QUERY);
    const onChange = () => setIsTabletViewport(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("sidebar-collapsed", sidebarIconOnly);
    document.body.classList.toggle("sidebar-tablet-expanded", sidebarTabletExpanded);
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new Event("ec:sidebar-layout-changed"));
    }, 280);
    return () => {
      window.clearTimeout(timer);
      document.body.classList.remove("sidebar-collapsed", "sidebar-tablet-expanded");
    };
  }, [sidebarIconOnly, sidebarTabletExpanded]);

  const collapseSidebar = useCallback(() => {
    setSidebarCollapsed(true);
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "1");
  }, []);

  const expandSidebar = useCallback(() => {
    setSidebarCollapsed(false);
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "0");
  }, []);

  const onHamburgerClick = useCallback(
    (e) => {
      e.stopPropagation();
      if (sidebarCollapsed) expandSidebar();
    },
    [sidebarCollapsed, expandSidebar],
  );

  return {
    isTabletViewport,
    sidebarCollapsed,
    sidebarIconOnly,
    sidebarTabletExpanded,
    collapseSidebar,
    expandSidebar,
    onHamburgerClick,
  };
}
