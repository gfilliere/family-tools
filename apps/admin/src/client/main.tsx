import { render } from "preact";
import { useEffect, useState, useRef } from "preact/hooks";
import "@family-tools/ui/styles.css";
import "./app.css";

interface UserItem {
  email: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: string;
}

interface MeResponse {
  email: string;
  displayName: string;
  isAdmin: boolean;
}

async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data?.error) return data.error;
  } catch {
    try {
      const text = await res.text();
      if (text) return text;
    } catch {
      // ignore
    }
  }
  return fallback;
}

function AdminApp() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [users, setUsers] = useState<UserItem[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form State
  const [newEmail, setNewEmail] = useState<string>("");
  const [newDisplayName, setNewDisplayName] = useState<string>("");
  const [newIsAdmin, setNewIsAdmin] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Inline Edit State
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const editInputRef = useRef<HTMLInputElement | null>(null);

  // Delete Confirmation State
  const [confirmDeleteEmail, setConfirmDeleteEmail] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [meRes, usersRes] = await Promise.all([
        fetch("/admin/api/me"),
        fetch("/admin/api/users"),
      ]);

      if (meRes.status === 401 || usersRes.status === 401) {
        const failedRes = meRes.status === 401 ? meRes : usersRes;
        const msg = await extractErrorMessage(failedRes, "Authentication required: Missing Cloudflare Access identity header.");
        throw new Error(msg);
      }
      if (meRes.status === 403 || usersRes.status === 403) {
        const failedRes = meRes.status === 403 ? meRes : usersRes;
        const msg = await extractErrorMessage(failedRes, "Access denied: You do not have administrator privileges.");
        throw new Error(msg);
      }
      if (!meRes.ok || !usersRes.ok) {
        const failedRes = !meRes.ok ? meRes : usersRes;
        const msg = await extractErrorMessage(failedRes, `Server returned error (${failedRes.status})`);
        throw new Error(msg);
      }

      const meData = (await meRes.json()) as MeResponse;
      const usersData = (await usersRes.json()) as { users: UserItem[] };

      setMe(meData);
      setUsers(usersData.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (editingEmail && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingEmail]);

  async function handleAddUser(e: Event) {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    const displayName = newDisplayName.trim();

    if (!email) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!displayName) {
      setError("Please enter a display name.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/admin/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName, isAdmin: newIsAdmin }),
      });

      const body = await res.json() as { error?: string; user?: UserItem };
      if (!res.ok) {
        throw new Error(body.error || `Failed to create user (${res.status})`);
      }

      setSuccess(`Added "${displayName}" (${email})`);
      setNewEmail("");
      setNewDisplayName("");
      setNewIsAdmin(false);

      if (body.user) {
        setUsers((prev) => (prev ? [...prev, body.user!].toSorted((a, b) => a.displayName.localeCompare(b.displayName)) : [body.user!]));
      } else {
        await loadData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEditing(user: UserItem) {
    setEditingEmail(user.email);
    setEditingName(user.displayName);
    setConfirmDeleteEmail(null);
  }

  function cancelEditing() {
    setEditingEmail(null);
    setEditingName("");
  }

  async function handleSaveDisplayName(user: UserItem) {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setError("Display name cannot be blank.");
      return;
    }
    if (trimmed === user.displayName) {
      cancelEditing();
      return;
    }

    setError(null);
    try {
      const res = await fetch(`/admin/api/users/${encodeURIComponent(user.email)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: trimmed }),
      });

      const body = await res.json() as { error?: string };
      if (!res.ok) {
        throw new Error(body.error || `Failed to update name (${res.status})`);
      }

      setUsers((prev) =>
        prev
          ? prev
              .map((u) => (u.email === user.email ? { ...u, displayName: trimmed } : u))
              .toSorted((a, b) => a.displayName.localeCompare(b.displayName))
          : null,
      );
      setSuccess(`Updated display name for ${user.email}`);
      cancelEditing();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update display name.");
    }
  }

  async function handleToggleAdmin(user: UserItem) {
    if (user.email === me?.email && user.isAdmin) {
      setError("Lockout protection: You cannot remove your own administrator status.");
      return;
    }

    const nextAdminState = !user.isAdmin;
    setError(null);
    try {
      const res = await fetch(`/admin/api/users/${encodeURIComponent(user.email)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAdmin: nextAdminState }),
      });

      const body = await res.json() as { error?: string };
      if (!res.ok) {
        throw new Error(body.error || `Failed to update permissions (${res.status})`);
      }

      setUsers((prev) =>
        prev ? prev.map((u) => (u.email === user.email ? { ...u, isAdmin: nextAdminState } : u)) : null,
      );
      setSuccess(`${nextAdminState ? "Granted" : "Revoked"} admin permissions for ${user.displayName}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change admin permissions.");
    }
  }

  async function handleDeleteUser(user: UserItem) {
    if (user.email === me?.email) {
      setError("Lockout protection: You cannot delete your own account.");
      setConfirmDeleteEmail(null);
      return;
    }

    setError(null);
    try {
      const res = await fetch(`/admin/api/users/${encodeURIComponent(user.email)}`, {
        method: "DELETE",
      });

      const body = await res.json() as { error?: string };
      if (!res.ok) {
        throw new Error(body.error || `Failed to delete user (${res.status})`);
      }

      setUsers((prev) => (prev ? prev.filter((u) => u.email !== user.email) : null));
      setSuccess(`Deleted user ${user.displayName} (${user.email})`);
      setConfirmDeleteEmail(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user.");
    }
  }

  return (
    <div class="admin-container">
      {/* Top Navigation */}
      <nav class="top-nav">
        <a href="/" class="nav-back">
          <svg class="nav-back-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Family Tools</span>
        </a>
        <div class="admin-pill">
          <span>Admin Access</span>
        </div>
      </nav>

      {/* Header */}
      <header class="app-header">
        <div class="header-title-row">
          <h1 class="header-title">User Directory</h1>
          {me?.email && (
            <span class="caller-badge" title={`Signed in as ${me.email}`}>
              {me.displayName}
            </span>
          )}
        </div>
      </header>

      {/* Notifications */}
      {error && (
        <div class="alert alert-error" role="alert">
          <span>{error}</span>
          <button class="alert-close" onClick={() => setError(null)} aria-label="Dismiss error">✕</button>
        </div>
      )}

      {success && (
        <div class="alert alert-success" role="status">
          <span>{success}</span>
          <button class="alert-close" onClick={() => setSuccess(null)} aria-label="Dismiss message">✕</button>
        </div>
      )}

      {/* Add User Section */}
      <section class="admin-card">
        <div class="section-head">
          <span class="eyebrow">Add Family Member</span>
        </div>

        <form class="add-form" onSubmit={handleAddUser}>
          <div class="form-group">
            <label class="form-label" for="add-email">Email Address</label>
            <input
              id="add-email"
              class="form-input"
              type="email"
              required
              placeholder="user@example.com"
              value={newEmail}
              onInput={(e) => setNewEmail((e.target as HTMLInputElement).value)}
              disabled={submitting}
              autoComplete="off"
              inputMode="email"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="add-name">Display Name</label>
            <input
              id="add-name"
              class="form-input"
              type="text"
              required
              placeholder="e.g. Marie"
              value={newDisplayName}
              onInput={(e) => setNewDisplayName((e.target as HTMLInputElement).value)}
              disabled={submitting}
              autoComplete="off"
            />
          </div>

          <div class="form-row-admin">
            <label class="checkbox-label" for="add-admin">
              <input
                id="add-admin"
                class="checkbox-input"
                type="checkbox"
                checked={newIsAdmin}
                onChange={(e) => setNewIsAdmin((e.target as HTMLInputElement).checked)}
                disabled={submitting}
              />
              <span>Grant admin privileges</span>
            </label>
          </div>

          <button
            class="submit-btn"
            type="submit"
            disabled={submitting || !newEmail.trim() || !newDisplayName.trim()}
          >
            {submitting ? "Adding…" : "+ Add User"}
          </button>
        </form>
      </section>

      {/* User Directory List */}
      <section class="admin-card">
        <div class="section-head">
          <span class="eyebrow">Configured Users</span>
          {users && <span class="user-count">{users.length}</span>}
        </div>

        {loading && !users && (
          <div class="users-list">
            <div class="skeleton-box"></div>
            <div class="skeleton-box"></div>
          </div>
        )}

        {users && users.length === 0 && (
          <div class="empty-state">
            <p>No users in the database yet.</p>
            <p style={{ marginTop: "4px", fontSize: "12px" }}>
              Cloudflare Access users will fall back to their email prefix until added above.
            </p>
          </div>
        )}

        {users && users.length > 0 && (
          <div class="users-list">
            {users.map((u) => {
              const isCaller = u.email === me?.email;
              const isEditing = editingEmail === u.email;
              const isConfirmingDelete = confirmDeleteEmail === u.email;

              return (
                <article key={u.email} class={`user-item ${isCaller ? "is-caller" : ""}`}>
                  <div class="user-item-main">
                    <div class="user-info">
                      {isEditing ? (
                        <div class="inline-edit-form">
                          <input
                            ref={editInputRef}
                            class="inline-edit-input"
                            type="text"
                            value={editingName}
                            onInput={(e) => setEditingName((e.target as HTMLInputElement).value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveDisplayName(u);
                              if (e.key === "Escape") cancelEditing();
                            }}
                            maxLength={100}
                          />
                          <button
                            class="action-btn-sm save-btn"
                            type="button"
                            onClick={() => handleSaveDisplayName(u)}
                          >
                            Save
                          </button>
                          <button
                            class="action-btn-sm cancel-btn"
                            type="button"
                            onClick={cancelEditing}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div class="user-name-row">
                          <span class="user-display-name">{u.displayName}</span>
                          <button
                            class="edit-trigger-btn"
                            type="button"
                            onClick={() => startEditing(u)}
                            title="Edit display name"
                            aria-label={`Edit display name for ${u.displayName}`}
                          >
                            <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                            </svg>
                            <span>edit</span>
                          </button>
                        </div>
                      )}

                      <div class="user-email">{u.email}</div>
                    </div>

                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {isCaller && <span class="badge-tag you">You</span>}
                      {u.isAdmin && <span class="badge-tag admin">Admin</span>}
                    </div>
                  </div>

                  <div class="user-item-controls">
                    <label
                      class={`admin-toggle-label ${isCaller ? "is-disabled" : ""}`}
                      title={isCaller ? "Cannot revoke your own admin rights" : "Toggle admin access"}
                    >
                      <input
                        class="checkbox-input"
                        type="checkbox"
                        checked={u.isAdmin}
                        disabled={isCaller}
                        onChange={() => handleToggleAdmin(u)}
                      />
                      <span>Administrator</span>
                    </label>

                    {isConfirmingDelete ? (
                      <div class="confirm-box">
                        <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--rust)" }}>Delete?</span>
                        <button
                          class="confirm-delete-btn"
                          type="button"
                          onClick={() => handleDeleteUser(u)}
                        >
                          Confirm
                        </button>
                        <button
                          class="confirm-cancel-btn"
                          type="button"
                          onClick={() => setConfirmDeleteEmail(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        class="delete-btn"
                        type="button"
                        disabled={isCaller}
                        title={isCaller ? "Cannot delete your own account" : `Delete ${u.displayName}`}
                        onClick={() => {
                          cancelEditing();
                          setConfirmDeleteEmail(u.email);
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

render(<AdminApp />, document.getElementById("app")!);
