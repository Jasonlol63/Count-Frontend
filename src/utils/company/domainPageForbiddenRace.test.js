/**
 * Repro: Domain page shows Forbidden when UI thinks C168 is active
 * (via sessionStorage / owner-company cache) but PHP session company is not C168 yet.
 *
 * domain_api.php list gate: !$hasC168Context || !$canUseC168DomainActions → 403 "Forbidden"
 * Frontend gate: canAccessC168DomainPages(me) uses isActiveCompanyContextC168 which
 * also trusts readDashboardSelectedCompanyId() + findOwnerCompanyById().
 * Fix: ensureC168DomainApiSession / resolveC168DomainSessionTargetId sync PHP first.
 */
import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";

import {
  canAccessC168DomainPages,
  isActiveCompanyContextC168,
} from "./loginScope.js";
import { resolveC168DomainSessionTargetId } from "./companySessionSync.js";
import {
  DASHBOARD_GROUP_ONLY_KEY,
  DASHBOARD_SELECTED_COMPANY_KEY,
  setCachedOwnerCompanies,
} from "./sharedCompanyFilter.js";

const C168_PK = 42;
const OTHER_PK = 99;

function installMemorySessionStorage() {
  const store = new Map();
  const api = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      store.set(String(k), String(v));
    },
    removeItem: (k) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };
  globalThis.window = { sessionStorage: api, localStorage: api };
  globalThis.sessionStorage = api;
  return api;
}

describe("Domain Forbidden race — frontend vs PHP session", () => {
  /** @type {{ clear: () => void, setItem: Function, removeItem: Function }} */
  let storage;

  before(() => {
    storage = installMemorySessionStorage();
  });

  beforeEach(() => {
    storage.clear();
    setCachedOwnerCompanies([
      { id: C168_PK, company_id: "C168", group_id: "AP" },
      { id: OTHER_PK, company_id: "JKCO", group_id: "AP" },
    ]);
    storage.removeItem(DASHBOARD_GROUP_ONLY_KEY);
  });

  it("grants Domain UI when persisted company is C168 even if me.session company is not", () => {
    storage.setItem(DASHBOARD_SELECTED_COMPANY_KEY, String(C168_PK));

    const me = {
      role: "partnership",
      company_id: OTHER_PK,
      company_code: "JKCO",
      is_current_company_c168: false,
      has_c168_domain_page_access: false,
    };

    assert.equal(isActiveCompanyContextC168(me), true);
    assert.equal(canAccessC168DomainPages(me), true);

    const phpHasC168Context =
      String(me.company_code || "").toUpperCase() === "C168" ||
      Boolean(me.is_current_company_c168);
    assert.equal(
      phpHasC168Context,
      false,
      "PHP session mirror of me is not C168 → domain_api list returns 403 Forbidden"
    );
  });

  it("denies Domain UI when neither me nor persisted filter is C168", () => {
    storage.setItem(DASHBOARD_SELECTED_COMPANY_KEY, String(OTHER_PK));
    const me = {
      role: "partnership",
      company_id: OTHER_PK,
      company_code: "JKCO",
      is_current_company_c168: false,
    };
    assert.equal(canAccessC168DomainPages(me), false);
  });

  it("resolveC168DomainSessionTargetId prefers persisted C168 over stale me.company_id", () => {
    storage.setItem(DASHBOARD_SELECTED_COMPANY_KEY, String(C168_PK));
    const me = {
      role: "partnership",
      company_id: OTHER_PK,
      company_code: "JKCO",
      is_current_company_c168: false,
    };
    assert.equal(resolveC168DomainSessionTargetId(me), C168_PK);
  });

  it("resolveC168DomainSessionTargetId still returns C168 when me is already optimistic C168", () => {
    storage.setItem(DASHBOARD_SELECTED_COMPANY_KEY, String(C168_PK));
    const me = {
      role: "partnership",
      company_id: C168_PK,
      company_code: "C168",
      is_current_company_c168: true,
    };
    // ensureC168DomainApiSession must still await sync — target id is C168 either way.
    assert.equal(resolveC168DomainSessionTargetId(me), C168_PK);
  });
});
