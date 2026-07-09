import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { buildApiUrl } from "../../utils/core/apiUrl.js";
import "../../../public/css/accountCSS.css";
import "../../../public/css/deleted-log.css";
import { spaPath } from "../../utils/routing/pageRoutes.js";

function buildListUrl(searchParams) {
  const u = new URL(buildApiUrl("api/deleted_log_list_api.php"));
  const entry = searchParams.get("entry")?.trim() ?? "";
  const user = searchParams.get("user")?.trim() ?? "";
  const module = searchParams.get("module")?.trim() ?? "";
  const q = searchParams.get("q")?.trim() ?? "";
  const pRaw = searchParams.get("p")?.trim() ?? "1";
  const p = Math.max(1, parseInt(pRaw, 10) || 1);
  if (entry !== "") u.searchParams.set("entry", entry);
  if (user !== "") u.searchParams.set("user", user);
  if (module !== "") u.searchParams.set("module", module);
  if (q !== "") u.searchParams.set("q", q);
  u.searchParams.set("p", String(p));
  return u.toString();
}

export default function DeletedLogPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  const [draftUser, setDraftUser] = useState("");
  const [draftModule, setDraftModule] = useState("");
  const [draftQ, setDraftQ] = useState("");

  const [jsonOverlayOpen, setJsonOverlayOpen] = useState(false);
  const [jsonOverlayText, setJsonOverlayText] = useState("");

  const appliedEntry = searchParams.get("entry")?.trim() ?? "";

  useEffect(() => {
    const prev = document.title;
    document.title = "Deleted Log - EazyCount";
    document.body.classList.remove("bg");
    document.body.classList.add("account-page");
    return () => {
      document.title = prev;
      document.body.classList.remove("account-page");
      document.body.classList.add("dashboard-page");
    };
  }, []);

  useEffect(() => {
    setDraftUser(searchParams.get("user")?.trim() ?? "");
    setDraftModule(searchParams.get("module")?.trim() ?? "");
    setDraftQ(searchParams.get("q")?.trim() ?? "");
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(buildListUrl(searchParams), {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        setFetchError("Invalid response");
        setPayload(null);
        return;
      }
      if (json.status === "error" && json.redirect) {
        navigate(json.redirect, { replace: true });
        return;
      }
      if (!res.ok || json.success === false) {
        if (res.status === 403) {
          navigate(spaPath("dashboard"), { replace: true });
          return;
        }
        setFetchError(json.message || json.error || "Load failed");
        setPayload(null);
        return;
      }
      setPayload(json.data || null);
    } catch {
      setFetchError("Network error");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const onApply = (e) => {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    const entry = appliedEntry;
    if (entry !== "") next.set("entry", entry);
    else next.delete("entry");

    if (draftUser.trim() !== "") next.set("user", draftUser.trim());
    else next.delete("user");

    if (draftModule.trim() !== "") next.set("module", draftModule.trim());
    else next.delete("module");

    if (draftQ.trim() !== "") next.set("q", draftQ.trim());
    else next.delete("q");

    next.set("p", "1");
    setSearchParams(next);
  };

  const setEntryTab = (tabKey) => {
    const next = new URLSearchParams(searchParams);
    if (tabKey === "") next.delete("entry");
    else next.set("entry", tabKey);
    next.set("p", "1");
    setSearchParams(next);
  };

  const goPage = (p) => {
    const next = new URLSearchParams(searchParams);
    next.set("p", String(p));
    setSearchParams(next);
  };

  const onRestore = (id) => {
    const n = parseInt(String(id), 10);
    if (!n || !window.confirm("Restore this record from the log?")) return;
    const sidebarCompanyId = payload?.sidebar_company_id != null ? String(payload.sidebar_company_id) : "";
    fetch(buildApiUrl("api/restore_api.php"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ log_id: n }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j && j.success) {
          const d = j.data || {};
          const lc = d.log_company_id != null ? String(d.log_company_id) : "";
          const sid = sidebarCompanyId;
          if (lc !== "" && String(sid) !== lc) {
            window.alert(
              "数据已写回数据库。若要在账号列表等页面查看，请先在侧栏切换到该删除记录所属公司（内部 company id: " +
                lc +
                "）。"
            );
          }
          load();
        } else {
          window.alert(j && (j.message || j.error) ? j.message || j.error : "Restore failed");
        }
      })
      .catch(() => {
        window.alert("Restore failed");
      });
  };

  const scopeHintHtml = payload?.scope_hint_html ?? "";
  const rows = payload?.rows ?? [];
  const pagination = payload?.pagination ?? { page: 1, total_pages: 1, total: 0 };
  const usersDistinct = payload?.users_distinct ?? [];
  const moduleMap = payload?.module_map ?? {};
  const entryTabs = payload?.entry_tabs ?? [];
  const moduleOptions = Object.entries(moduleMap);

  const prevDisabled = pagination.page <= 1;
  const nextDisabled = pagination.page >= pagination.total_pages;

  const closeOverlay = () => {
    setJsonOverlayOpen(false);
    setJsonOverlayText("");
  };

  return (
    <>
      <div className="container">
        <div className="content">
          {scopeHintHtml !== "" ? (
            <p className="deleted-log-scope-hint" dangerouslySetInnerHTML={{ __html: scopeHintHtml }} />
          ) : null}

          <nav className="deleted-log-entry-tabs" aria-label="Delete entry source">
            {entryTabs.map((tab) => (
              <a
                key={tab.key === "" ? "__all__" : tab.key}
                href="#"
                className={`deleted-log-entry-tab${tab.active ? " is-active" : ""}`}
                title={tab.hint || undefined}
                onClick={(e) => {
                  e.preventDefault();
                  setEntryTab(tab.key);
                }}
              >
                {tab.label}
              </a>
            ))}
          </nav>

          <form className="deleted-log-toolbar" onSubmit={onApply}>
            {appliedEntry !== "" ? <input type="hidden" name="entry" value={appliedEntry} /> : null}
            <div>
              <label htmlFor="f-user">User</label>
              <select
                id="f-user"
                value={draftUser}
                onChange={(e) => setDraftUser(e.target.value)}
              >
                <option value="">All</option>
                {usersDistinct.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-module">Module</label>
              <select
                id="f-module"
                value={draftModule}
                onChange={(e) => setDraftModule(e.target.value)}
              >
                <option value="">All</option>
                {moduleOptions.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-q">Search</label>
              <input
                type="search"
                id="f-q"
                placeholder="User, page, Acc ID, IP…"
                value={draftQ}
                onChange={(e) => setDraftQ(e.target.value)}
              />
            </div>
            <button type="submit" className="account-btn account-btn-add">
              Apply
            </button>
          </form>

          {fetchError ? (
            <p style={{ padding: "12px 16px", color: "#b91c1c" }}>{fetchError}</p>
          ) : null}

          <div className="account-table-wrapper">
            <div className="deleted-log-table-header">
              <div>Time</div>
              <div>User</div>
              <div>Company</div>
              <div>Acc ID</div>
              <div>What happened</div>
              <div>IP</div>
              <div>Detail</div>
              <div>Restore</div>
            </div>
            {!loading &&
              rows.map((r) => (
                <div key={r.id} className="deleted-log-card" data-log-id={r.id}>
                  <div>{r.created_at}</div>
                  <div>{r.user}</div>
                  <div>{r.company}</div>
                  <div>{r.acc_id}</div>
                  <div className="deleted-log-summary-cell" title={r.summary}>
                    {r.summary}
                  </div>
                  <div>{r.ip_address}</div>
                  <div className="deleted-log-cell-actions">
                    <button
                      type="button"
                      className="deleted-log-btn deleted-log-btn--primary js-deleted-view"
                      onClick={() => {
                        setJsonOverlayText(r.json_pretty || "");
                        setJsonOverlayOpen(true);
                      }}
                    >
                      View
                    </button>
                  </div>
                  <div className="deleted-log-cell-actions">
                    {r.can_restore ? (
                      <button
                        type="button"
                        className="deleted-log-btn deleted-log-btn--danger js-deleted-restore"
                        data-id={r.id}
                        onClick={() => onRestore(r.id)}
                      >
                        Restore
                      </button>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>—</span>
                    )}
                  </div>
                </div>
              ))}
            {!loading && rows.length === 0 ? (
              <div className="deleted-log-card" style={{ gridTemplateColumns: "1fr", border: "none" }}>
                <div style={{ padding: "16px", color: "#64748b" }}>No records.</div>
              </div>
            ) : null}
            {loading ? (
              <div className="deleted-log-card" style={{ gridTemplateColumns: "1fr", border: "none" }}>
                <div style={{ padding: "16px", color: "#64748b" }}>Loading…</div>
              </div>
            ) : null}
          </div>

          <div className="account-pagination-container" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="account-pagination-btn"
              disabled={prevDisabled}
              onClick={() => goPage(Math.max(1, pagination.page - 1))}
            >
              ◀
            </button>
            <span className="account-pagination-info">
              {pagination.page} / {pagination.total_pages} ({pagination.total})
            </span>
            <button
              type="button"
              className="account-pagination-btn"
              disabled={nextDisabled}
              onClick={() => goPage(Math.min(pagination.total_pages, pagination.page + 1))}
            >
              ▶
            </button>
          </div>
        </div>
      </div>

      <div
        id="deletedLogJsonOverlay"
        className={`deleted-log-json-modal-overlay${jsonOverlayOpen ? " is-open" : ""}`}
        aria-hidden={jsonOverlayOpen ? "false" : "true"}
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeOverlay();
        }}
      >
        <div className="deleted-log-json-modal" role="dialog" aria-modal="true" aria-labelledby="deletedLogJsonTitle">
          <header>
            <strong id="deletedLogJsonTitle">Deleted data (JSON)</strong>
            <button type="button" className="account-close" aria-label="Close" onClick={closeOverlay} />
          </header>
          <pre id="deletedLogJsonPre">{jsonOverlayText}</pre>
        </div>
      </div>
    </>
  );
}
