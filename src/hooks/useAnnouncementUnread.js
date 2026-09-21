import { useCallback, useEffect, useRef, useState } from "react";
import { buildApiUrl } from "../utils/core/apiUrl.js";
import { fetchAccessibleTenants } from "../utils/company/tenantAccessibleApi.js";
import { readDashboardSelectedCompanyId } from "../utils/company/sharedCompanyFilter.js";
import { onRealtimeInvalidate, REALTIME_DOMAINS } from "../lib/realtime/realtimeEvents.js";

/**
 * 通告未读数量：按 用户 + 当前公司(tenant) 维度，存在 localStorage。
 * 首次进入某个公司（无 localStorage 记录）时，以该用户加入这个公司的时间
 * (tenant.grantedAt) 作为已读基准，避免历史通告被当成未读。
 *
 * "当前公司" 优先用 `dashboard_selected_company_id`（Owner 在 Group 内钻到某个具体子公司时，
 * 由 Account List / User List 等页面自己的筛选器写入），因为这是真正代表"当前正在看哪家公司"的信号；
 * 但这个值只在用户碰过那几个页面的筛选器、且不是 Group 聚合视图时才存在——Group 级别登录时会被显式清空，
 * 其它大多数页面也完全不会去写它。所以兜底一定要退回到 `me.tenant_id`（登录 session 自带、永远有值的
 * 公司/group tenant id），否则大部分场景下读不到"当前公司"，未读数永远是 0。
 */
function readLastReadIso(userId, tenantId) {
  try {
    return window.localStorage.getItem(`announcement_last_read_${userId}_${tenantId}`);
  } catch {
    return null;
  }
}

function writeLastReadIso(userId, tenantId, iso) {
  try {
    window.localStorage.setItem(`announcement_last_read_${userId}_${tenantId}`, iso);
  } catch {
    /* ignore */
  }
}

/**
 * @param {object} me - current session user (`/auth/current-user`, normalized or raw)
 * @param {number|string} [refreshTick] - bump to force a recompute (e.g. a page's own company
 *   filter changed the drill-down selection without `me` itself changing)
 * @param {number} [pollMs] - fallback poll interval in ms, for shells that don't mount
 *   AppRealtimeBridge (so the "live push" effect below never fires). 0 disables polling.
 */
export function useAnnouncementUnread(me, refreshTick = 0, pollMs = 0) {
  const [unreadCount, setUnreadCount] = useState(0);
  const requestSeqRef = useRef(0);

  // IT operators have no `user_id` (config-based identity, not a DB user row) — fall back to a
  // stable composite of user_type + login_id so they still get their own read-state bucket.
  const userId =
    me?.user_id != null
      ? String(me.user_id)
      : me?.user_type && me?.login_id
        ? `${me.user_type}:${me.login_id}`
        : "";

  const sessionTenantIdRaw = me?.tenant_id ?? me?.company_id ?? null;
  const sessionTenantId =
    Number.isFinite(Number(sessionTenantIdRaw)) && Number(sessionTenantIdRaw) > 0
      ? Number(sessionTenantIdRaw)
      : null;

  const resolveTenantId = useCallback(() => {
    const drillDown = readDashboardSelectedCompanyId();
    return drillDown ?? sessionTenantId;
  }, [sessionTenantId]);

  const refresh = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    const tenantId = resolveTenantId();
    if (!userId || !tenantId) {
      setUnreadCount(0);
      return;
    }

    try {
      const [annRes, tenantsInfo] = await Promise.all([
        fetch(buildApiUrl("api/announcement/getDashboardAnnouncements"), { credentials: "include" }).then((r) =>
          r.json(),
        ),
        fetchAccessibleTenants(),
      ]);
      if (seq !== requestSeqRef.current) return; // stale response (company/user changed mid-flight)

      const announcements = Array.isArray(annRes?.data) ? annRes.data : [];
      const tenant = tenantsInfo.tenants.find((t) => String(t.tenantId) === String(tenantId));

      const lastReadIso = readLastReadIso(userId, tenantId);
      const baseline = lastReadIso
        ? new Date(lastReadIso)
        : tenant?.grantedAt
          ? new Date(tenant.grantedAt)
          : null;

      if (!baseline || Number.isNaN(baseline.getTime())) {
        setUnreadCount(0);
        return;
      }

      const count = announcements.filter((item) => {
        const raw = item.createdAt ?? item.created_at;
        if (!raw) return false;
        const createdAt = new Date(raw);
        return !Number.isNaN(createdAt.getTime()) && createdAt > baseline;
      }).length;

      setUnreadCount(count);
    } catch {
      if (seq === requestSeqRef.current) setUnreadCount(0);
    }
  }, [userId, resolveTenantId]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshTick]);

  // Live push: backend broadcasts RealtimeDomain.ANNOUNCEMENTS on every create/update/delete
  // (AnnouncementServiceImpl) over the app-wide STOMP connection (AppRealtimeBridge). Any shell
  // that mounts that bridge gets an immediate recompute here instead of waiting for a reload.
  // A shell without the bridge mounted (nothing dispatches this event) just never fires — harmless.
  useEffect(() => {
    return onRealtimeInvalidate(REALTIME_DOMAINS.ANNOUNCEMENTS, () => {
      void refresh();
    });
  }, [refresh]);

  // Fallback for shells with no live push connection (e.g. the member self-service shell,
  // which doesn't mount AppRealtimeBridge): poll instead so the badge still catches up without
  // requiring a manual reload.
  useEffect(() => {
    if (!pollMs || pollMs <= 0) return undefined;
    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refresh();
    }, pollMs);
    return () => window.clearInterval(timer);
  }, [refresh, pollMs]);

  const markRead = useCallback(() => {
    const tenantId = resolveTenantId();
    if (!userId || !tenantId) return;
    writeLastReadIso(userId, tenantId, new Date().toISOString());
    setUnreadCount(0);
  }, [userId, resolveTenantId]);

  return { unreadCount, refreshAnnouncementUnread: refresh, markAnnouncementsRead: markRead };
}
