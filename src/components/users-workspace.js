"use client";
import UsersManagement from "@/components/users-management";
export default function UsersWorkspace() {
  return <UsersManagement />;
/*
  const { user } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const q = useDebounce(query);
  const result = useData(`/users?page=${page}&q=${encodeURIComponent(q)}`);
  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    const f = new FormData(event.currentTarget);
    const input = {
      name: f.get("name"),
      username: f.get("username"),
      role: f.get("role"),
      active: f.get("active") === "true",
      ...(f.get("password") ? { password: f.get("password") } : {}),
    };
    try {
      await api(editor._id ? `/users/${editor._id}` : "/users", {
        method: editor._id ? "PATCH" : "POST",
        body: input,
      });
      toast.success("User saved. Existing sessions have been revoked.");
      if (editor._id === user._id) {
        router.replace("/login");
        router.refresh();
      }
      setEditor(null);
      result.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <PageHeading
        title="Users"
        description="Manage your team and their access."
      >
        <button
          className="button primary"
          onClick={() => {
            setError("");
            setEditor({
              name: "",
              username: "",
              role: "CASHIER",
              active: true,
            });
          }}
        >
          Add User
        </button>
      </PageHeading>
      <section className="products-panel">
        <div className="toolbar">
          <input
            aria-label="Search users"
            placeholder="Search name or username…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Notice {...result} retry={result.refresh}>
          {result.data?.items.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {["Name", "Username", "Role", "Status", "Actions"].map(
                      (s) => (
                        <th key={s}>{s}</th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {result.data.items.map((u) => (
                    <tr key={u._id}>
                      <td>{u.name}</td>
                      <td>{u.username}</td>
                      <td>{u.role}</td>
                      <td>
                        <span className={`badge ${u.active ? "active" : ""}`}>
                          {u.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => {
                            setError("");
                            setEditor(u);
                          }}
                        >
                          Edit / Reset password
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="No users found" />
          )}
        </Notice>
        <Pagination data={result.data} page={page} setPage={setPage} />
      </section>
      {editor && (
        <Modal
          title={editor._id ? "Edit User" : "Add User"}
          onClose={pending ? () => {} : () => setEditor(null)}
        >
          <form onSubmit={submit}>
            <fieldset disabled={pending} className="modal-body">
              <Field
                label="Name"
                name="name"
                required
                maxLength={100}
                defaultValue={editor.name}
                autoFocus
              />
              <Field
                label="Username"
                name="username"
                required
                pattern="[a-zA-Z0-9._-]+"
                maxLength={60}
                autoComplete="off"
                defaultValue={editor.username}
              />
              <Field
                label={
                  editor._id
                    ? "New password (leave blank to keep current)"
                    : "Password"
                }
                name="password"
                type="password"
                required={!editor._id}
                minLength={8}
                maxLength={12}
                autoComplete="new-password"
              />
              <div className="field-grid">
                <Field label="Role">
                  <select name="role" defaultValue={editor.role}>
                    <option>ADMIN</option>
                    <option>CASHIER</option>
                  </select>
                </Field>
                <Field label="Status">
                  <select name="active" defaultValue={String(editor.active)}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </Field>
              </div>
              <p className="muted">
                Saving changes signs this user out of existing sessions.
              </p>
              {error && <p className="form-error">{error}</p>}
            </fieldset>
            <footer className="modal-footer">
              <button
                type="button"
                className="button secondary"
                disabled={pending}
                onClick={() => setEditor(null)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={pending}>
                {pending ? "Saving…" : "Save user"}
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
*/}
