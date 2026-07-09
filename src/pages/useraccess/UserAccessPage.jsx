import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../../utils/core/apiUrl.js";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";
import { spaPath } from "../../utils/routing/pageRoutes.js";

const PERMISSION_OPTIONS = [
  "home",
  "admin",
  "account",
  "ownership",
  "process",
  "datacapture",
  "payment",
  "report",
  "maintenance",
];

function parseJsonArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function UserAccessPage() {
  const navigate = useNavigate();
  const { me, sessionReady } = useAuthSession();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [sourceType, setSourceType] = useState("template");
  const [templateUserId, setTemplateUserId] = useState("");
  const [manualPermissions, setManualPermissions] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState(new Set());
  const [pendingSelectedUserIds, setPendingSelectedUserIds] = useState(new Set());
  const [selectedAccountIds, setSelectedAccountIds] = useState(new Set());
  const [selectedProcessIds, setSelectedProcessIds] = useState(new Set());
  const [accountSearch, setAccountSearch] = useState("");
  const [processSearch, setProcessSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!sessionReady || !me) return;
    let cancelled = false;
    (async () => {
      try {
        const companyId = Number(me.company_id || 0);

        const usersRes = await fetch(buildApiUrl("api/useraccess/useraccess_api.php"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get_all_users" }),
        });
        const usersJson = await usersRes.json();
        const list = Array.isArray(usersJson?.data) ? usersJson.data : [];

        const [accData, procData] = await Promise.all([
          fetch(buildApiUrl(`api/account/list?tenant_id=${companyId}`), { method: "POST", credentials: "include" })
            .then(async (r) => { const j = await r.json(); return Array.isArray(j?.data) ? j.data : []; })
            .catch(() => []),
          fetch(buildApiUrl(`api/processes/processlist_api.php?company_id=${companyId}&showAll=1`), { credentials: "include" })
            .then(async (r) => { const j = await r.json(); return Array.isArray(j?.data) ? j.data : []; })
            .catch(() => []),
        ]);

        if (!cancelled) {
          setUsers(list);
          setAccounts(accData);
          setProcesses(procData);
        }
      } catch {
        if (!cancelled) setNotice("Failed to load user access data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, me, navigate]);

  const templateUser = useMemo(
    () => users.find((u) => String(u.id) === String(templateUserId)) || null,
    [users, templateUserId],
  );

  const templatePermissions = useMemo(
    () => parseJsonArray(templateUser?.permissions),
    [templateUser],
  );
  const templateAccountPermissions = useMemo(
    () => parseJsonArray(templateUser?.account_permissions),
    [templateUser],
  );
  const templateProcessPermissions = useMemo(
    () => parseJsonArray(templateUser?.process_permissions),
    [templateUser],
  );

  useEffect(() => {
    if (sourceType !== "template") return;
    setSelectedAccountIds(new Set(templateAccountPermissions.map((x) => Number(x.id || x))));
    setSelectedProcessIds(new Set(templateProcessPermissions.map((x) => Number(x.id || x))));
  }, [sourceType, templateAccountPermissions, templateProcessPermissions]);

  const effectivePermissions = sourceType === "template" ? templatePermissions : manualPermissions;
  const templateUserIdNum = Number(templateUserId || 0);

  const visibleAccounts = useMemo(() => {
    const s = accountSearch.trim().toLowerCase();
    if (!s) return accounts;
    return accounts.filter((a) => String(a.accountId || "").toLowerCase().includes(s));
  }, [accounts, accountSearch]);

  const visibleProcesses = useMemo(() => {
    const s = processSearch.trim().toLowerCase();
    if (!s) return processes;
    return processes.filter((p) => {
      const pid = String(p.process_name || p.process_id || "").toLowerCase();
      const desc = String(p.description_name || p.description || "").toLowerCase();
      return pid.includes(s) || desc.includes(s);
    });
  }, [processes, processSearch]);

  const modalUsers = useMemo(() => {
    const s = userSearch.trim().toLowerCase();
    return users
      .filter((u) => Number(u.id) !== templateUserIdNum)
      .filter((u) => {
        if (!s) return true;
        const name = String(u.name || "").toLowerCase();
        const login = String(u.login_id || "").toLowerCase();
        return name.includes(s) || login.includes(s);
      });
  }, [users, templateUserIdNum, userSearch]);

  function toggleSet(setter, value) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function doUpdatePermissions() {
    if (sourceType === "template" && !templateUserId) {
      setNotice("Please select a template user");
      return;
    }
    if (!selectedUserIds.size) {
      setNotice("Please select at least one affected user");
      return;
    }
    setSubmitting(true);
    setNotice("");
    try {
      const accountPermissions = Array.from(selectedAccountIds).map((id) => {
        const row = accounts.find((a) => Number(a.id) === Number(id));
        return { id: Number(id), account_id: row?.accountId || "" };
      });
      const processPermissions = Array.from(selectedProcessIds).map((id) => {
        const row = processes.find((p) => Number(p.id) === Number(id));
        return { id: Number(id), process_id: row?.process_name || row?.process_id || "", process_description: row?.description_name || row?.description || "" };
      });

      const res = await fetch(buildApiUrl("api/useraccess/useraccess_api.php"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "copy_permissions",
          source_type: sourceType,
          template_user_id: sourceType === "template" ? Number(templateUserId) : null,
          affected_user_ids: Array.from(selectedUserIds).map(Number),
          permissions: effectivePermissions,
          account_permissions: accountPermissions,
          process_permissions: processPermissions,
        }),
      });
      const json = await res.json();
      setNotice(json?.message || (json?.success ? "Updated successfully" : "Update failed"));
      if (json?.success) {
        setSelectedUserIds(new Set());
      }
    } catch {
      setNotice("Failed to update permissions");
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenUserModal() {
    setPendingSelectedUserIds(new Set(selectedUserIds));
    setUserSearch("");
    setUserModalOpen(true);
  }

  function handleConfirmUserModal() {
    setSelectedUserIds(new Set(pendingSelectedUserIds));
    setUserModalOpen(false);
  }

  function handleRequestUpdate() {
    if (sourceType === "template" && !templateUserId) {
      setNotice("Please select a template user");
      return;
    }
    if (!selectedUserIds.size) {
      setNotice("Please select at least one affected user");
      return;
    }
    const sourceDesc =
      sourceType === "template" && templateUser
        ? `template user "${templateUser.name || templateUser.login_id}"`
        : `manual selection (${effectivePermissions.length} permissions)`;
    setConfirmMessage(`Are you sure you want to copy permissions from ${sourceDesc} to ${selectedUserIds.size} selected user(s)?`);
    setConfirmOpen(true);
  }

  function selectAllVisibleAccounts() {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      visibleAccounts.forEach((a) => next.add(Number(a.id)));
      return next;
    });
  }

  function clearAllAccounts() {
    setSelectedAccountIds(new Set());
  }

  function selectAllVisibleProcesses() {
    setSelectedProcessIds((prev) => {
      const next = new Set(prev);
      visibleProcesses.forEach((p) => next.add(Number(p.id)));
      return next;
    });
  }

  function clearAllProcesses() {
    setSelectedProcessIds(new Set());
  }

  return (
    <div style={{ marginLeft: 260, padding: 16 }}>
      <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
        <button onClick={() => navigate(spaPath("userlist"))}>Back</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16 }}>
        <div>
          <div style={{ marginBottom: 8 }}>
            <label>
              <input type="radio" checked={sourceType === "template"} onChange={() => setSourceType("template")} />
              Copy from user
            </label>
            <label style={{ marginLeft: 12 }}>
              <input type="radio" checked={sourceType === "manual"} onChange={() => setSourceType("manual")} />
              Manual
            </label>
          </div>

          {sourceType === "template" ? (
            <select value={templateUserId} onChange={(e) => setTemplateUserId(e.target.value)} style={{ width: "100%" }}>
              <option value="">-- Select user --</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.login_id})</option>
              ))}
            </select>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 6 }}>
              {PERMISSION_OPTIONS.map((p) => (
                <label key={p}>
                  <input
                    type="checkbox"
                    checked={manualPermissions.includes(p)}
                    onChange={(e) => {
                      setManualPermissions((prev) => e.target.checked ? [...prev, p] : prev.filter((x) => x !== p));
                    }}
                  />
                  {p}
                </label>
              ))}
            </div>
          )}

          <div style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 6, padding: 8 }}>
            <div>Permissions Preview</div>
            <div>{effectivePermissions.length ? effectivePermissions.join(", ") : "No permissions"}</div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div>Affected Users</div>
            <button type="button" onClick={handleOpenUserModal} style={{ width: "100%", textAlign: "left", padding: "8px 10px" }}>
              {selectedUserIds.size === 0 ? "Click to select users" : `${selectedUserIds.size} user(s) selected`}
            </button>
            <div style={{ marginTop: 6, color: "#555", fontSize: 13 }}>
              {selectedUserIds.size === 0 ? "No users selected" : `${selectedUserIds.size} user(s) selected`}
            </div>
          </div>
        </div>

        <div>
          <div>
            <div>Accounts</div>
            <div style={{ marginBottom: 8, display: "flex", gap: 8 }}>
              <input
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                placeholder="Search accounts"
                style={{ flex: 1 }}
              />
              <button type="button" onClick={selectAllVisibleAccounts}>Select All</button>
              <button type="button" onClick={clearAllAccounts}>Clear All</button>
            </div>
            <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid #ddd", borderRadius: 6, padding: 8 }}>
              {visibleAccounts.map((a) => (
                <label key={a.id} style={{ display: "inline-block", width: "20%" }}>
                  <input type="checkbox" checked={selectedAccountIds.has(Number(a.id))} onChange={() => toggleSet(setSelectedAccountIds, Number(a.id))} />
                  {a.accountId}
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div>Processes</div>
            <div style={{ marginBottom: 8, display: "flex", gap: 8 }}>
              <input
                value={processSearch}
                onChange={(e) => setProcessSearch(e.target.value)}
                placeholder="Search processes"
                style={{ flex: 1 }}
              />
              <button type="button" onClick={selectAllVisibleProcesses}>Select All</button>
              <button type="button" onClick={clearAllProcesses}>Clear All</button>
            </div>
            <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid #ddd", borderRadius: 6, padding: 8 }}>
              {visibleProcesses.map((p) => (
                <label key={p.id} style={{ display: "inline-block", width: "20%" }}>
                  <input type="checkbox" checked={selectedProcessIds.has(Number(p.id))} onChange={() => toggleSet(setSelectedProcessIds, Number(p.id))} />
                  {p.process_name || p.process_id}
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button disabled={submitting} onClick={handleRequestUpdate}>{submitting ? "Updating..." : "Update"}</button>
            <button onClick={() => navigate(spaPath("userlist"))}>Cancel</button>
          </div>
          {notice && <div style={{ marginTop: 8 }}>{notice}</div>}
        </div>
      </div>

      {userModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "center", zIndex: 4000 }}>
          <div style={{ width: "min(900px, 92vw)", maxHeight: "80vh", background: "#fff", borderRadius: 8, padding: 16, overflow: "auto" }}>
            <h3 style={{ marginTop: 0 }}>Select Users</h3>
            <input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search users"
              style={{ width: "100%", marginBottom: 10 }}
            />
            <div style={{ maxHeight: 420, overflow: "auto", border: "1px solid #ddd", borderRadius: 6, padding: 8 }}>
              {modalUsers.map((u) => (
                <label key={u.id} style={{ display: "inline-block", width: "20%" }}>
                  <input
                    type="checkbox"
                    checked={pendingSelectedUserIds.has(Number(u.id))}
                    onChange={() =>
                      setPendingSelectedUserIds((prev) => {
                        const next = new Set(prev);
                        const id = Number(u.id);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      })
                    }
                  />
                  {u.login_id}
                </label>
              ))}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={handleConfirmUserModal}>Confirm</button>
              <button type="button" onClick={() => setUserModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "center", zIndex: 4100 }}>
          <div style={{ width: "min(520px, 92vw)", background: "#fff", borderRadius: 8, padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Confirm Update</h3>
            <p style={{ marginTop: 8 }}>{confirmMessage}</p>
            <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmOpen(false);
                  await doUpdatePermissions();
                }}
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

