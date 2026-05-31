import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { 
  HiOutlineUserAdd, 
  HiOutlineShieldCheck, 
  HiOutlinePencil, 
  HiOutlineTrash,
  HiOutlineX,
  HiOutlinePlus
} from "react-icons/hi";
import { adminApi } from "../utlis/api";

const AdminManagement = ({ hasPermission }) => {
  const [activeTab, setActiveTab] = useState("admins");
  const [loading, setLoading] = useState(false);
  const [admins, setAdmins] = useState([]);
  const [roles, setRoles] = useState([]);
  const [availablePermissions, setAvailablePermissions] = useState([]);

  // Modals state
  const [adminModal, setAdminModal] = useState(null); // { mode: 'create'|'edit', data: {} }
  const [roleModal, setRoleModal] = useState(null); // { mode: 'create'|'edit', data: {} }

  const fetchData = async () => {
    setLoading(true);
    try {
      if (hasPermission("manage_admins")) {
        const adminRes = await adminApi.get("/admin/admins");
        setAdmins(adminRes.data.admins);
      }
      if (hasPermission("manage_roles")) {
        const roleRes = await adminApi.get("/admin/roles");
        setRoles(roleRes.data.roles);
        setAvailablePermissions(roleRes.data.availablePermissions);
      }
    } catch (error) {
      toast.error("Failed to load management data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [hasPermission]);

  // --- Admin Actions ---
  const handleSaveAdmin = async (e) => {
    e.preventDefault();
    if (!adminModal.data.username || !adminModal.data.fullName || !adminModal.data.email || !adminModal.data.roleId) {
      toast.error("All fields are required");
      return;
    }
    
    try {
      if (adminModal.mode === "create") {
        if (!adminModal.data.password || adminModal.data.password.length < 8) {
          toast.error("Password must be at least 8 characters");
          return;
        }
        await adminApi.post("/admin/register", {
          ...adminModal.data,
          roleId: adminModal.data.roleId
        });
        toast.success("Admin created successfully");
      } else {
        // Edit role only (for now)
        await adminApi.post(`/admin/admins/${adminModal.data.AdminID}/role`, {
          roleId: adminModal.data.roleId
        });
        toast.success("Admin role updated");
      }
      setAdminModal(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to save admin");
    }
  };

  // --- Role Actions ---
  const handleSaveRole = async (e) => {
    e.preventDefault();
    if (!roleModal.data.roleName) {
      toast.error("Role name is required");
      return;
    }
    
    try {
      const payload = {
        roleName: roleModal.data.roleName,
        description: roleModal.data.description,
        permissions: JSON.stringify(roleModal.data.permissions || [])
      };

      if (roleModal.mode === "create") {
        await adminApi.post("/admin/roles", payload);
        toast.success("Role created successfully");
      } else {
        await adminApi.put(`/admin/roles/${roleModal.data.RoleID}`, payload);
        toast.success("Role updated successfully");
      }
      setRoleModal(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to save role");
    }
  };

  const handleDeleteRole = async (roleId) => {
    if (!window.confirm("Are you sure you want to delete this role?")) return;
    try {
      await adminApi.delete(`/admin/roles/${roleId}`);
      toast.success("Role deleted successfully");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to delete role");
    }
  };

  const togglePermission = (perm) => {
    setRoleModal(prev => {
      const perms = prev.data.permissions || [];
      const newPerms = perms.includes(perm)
        ? perms.filter(p => p !== perm)
        : [...perms, perm];
      return { ...prev, data: { ...prev.data, permissions: newPerms } };
    });
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
        {hasPermission("manage_admins") && (
          <button 
            className={`btn ${activeTab === "admins" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("admins")}
          >
            Admin Accounts
          </button>
        )}
        {hasPermission("manage_roles") && (
          <button 
            className={`btn ${activeTab === "roles" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("roles")}
          >
            Roles & Permissions
          </button>
        )}
      </div>

      {loading && <p>Loading data...</p>}

      {!loading && activeTab === "admins" && hasPermission("manage_admins") && (
        <div className="table-container animate-fade-in">
          <div className="table-header">
            <span className="table-title">Admin Accounts</span>
            <button className="btn btn-primary btn-sm" onClick={() => setAdminModal({ mode: "create", data: {} })}>
              <HiOutlineUserAdd /> New Admin
            </button>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Admin</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map(admin => (
                <tr key={admin.AdminID}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{admin.fullName}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>@{admin.username}</div>
                  </td>
                  <td>{admin.email}</td>
                  <td>
                    <span className="badge badge-primary">{admin.RoleName || "None"}</span>
                  </td>
                  <td>
                    <span className={`badge ${admin.isActive ? 'badge-success' : 'badge-danger'}`}>
                      {admin.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>{admin.lastLogin ? new Date(admin.lastLogin).toLocaleString() : 'Never'}</td>
                  <td>
                    <button 
                      className="btn btn-secondary btn-sm" 
                      onClick={() => setAdminModal({ mode: "edit", data: { ...admin, roleId: admin.RoleID } })}
                    >
                      <HiOutlinePencil /> Edit Role
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && activeTab === "roles" && hasPermission("manage_roles") && (
        <div className="table-container animate-fade-in">
          <div className="table-header">
            <span className="table-title">System Roles</span>
            <button className="btn btn-primary btn-sm" onClick={() => setRoleModal({ mode: "create", data: { permissions: [] } })}>
              <HiOutlinePlus /> Create Role
            </button>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Role Name</th>
                <th>Description</th>
                <th>Permissions</th>
                <th>Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map(role => (
                <tr key={role.RoleID}>
                  <td style={{ fontWeight: 500, color: "var(--primary)" }}>
                    <HiOutlineShieldCheck style={{ verticalAlign: "middle", marginRight: "6px" }} />
                    {role.RoleName}
                  </td>
                  <td>{role.Description}</td>
                  <td>{role.permissions.length} perms</td>
                  <td>
                    {role.IsSystem ? (
                      <span className="badge badge-warning">System</span>
                    ) : (
                      <span className="badge badge-secondary">Custom</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => setRoleModal({ mode: "edit", data: role })}
                      >
                        <HiOutlinePencil /> Edit
                      </button>
                      {!role.IsSystem && (
                        <button 
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteRole(role.RoleID)}
                        >
                          <HiOutlineTrash />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Admin Modal */}
      {adminModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-scale-in" style={{ maxWidth: "500px" }}>
            <div className="modal-header">
              <h3>{adminModal.mode === "create" ? "Create New Admin" : `Edit Role: ${adminModal.data.username}`}</h3>
              <button className="modal-close" onClick={() => setAdminModal(null)}><HiOutlineX /></button>
            </div>
            <form onSubmit={handleSaveAdmin}>
              {adminModal.mode === "create" && (
                <>
                  <div className="form-group">
                    <label>Username</label>
                    <input type="text" className="form-input" required
                      value={adminModal.data.username || ""}
                      onChange={e => setAdminModal(p => ({ ...p, data: { ...p.data, username: e.target.value } }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Full Name</label>
                    <input type="text" className="form-input" required
                      value={adminModal.data.fullName || ""}
                      onChange={e => setAdminModal(p => ({ ...p, data: { ...p.data, fullName: e.target.value } }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input type="email" className="form-input" required
                      value={adminModal.data.email || ""}
                      onChange={e => setAdminModal(p => ({ ...p, data: { ...p.data, email: e.target.value } }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Password</label>
                    <input type="password" className="form-input" required minLength={8}
                      value={adminModal.data.password || ""}
                      onChange={e => setAdminModal(p => ({ ...p, data: { ...p.data, password: e.target.value } }))}
                    />
                  </div>
                </>
              )}
              
              <div className="form-group">
                <label>Assigned Role</label>
                <select className="form-input" required
                  value={adminModal.data.roleId || ""}
                  onChange={e => setAdminModal(p => ({ ...p, data: { ...p.data, roleId: e.target.value } }))}
                >
                  <option value="">Select a role...</option>
                  {roles.map(r => (
                    <option key={r.RoleID} value={r.RoleID}>{r.RoleName}</option>
                  ))}
                </select>
              </div>

              <div className="modal-footer" style={{ marginTop: "24px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setAdminModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Admin</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Role Modal */}
      {roleModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-scale-in" style={{ maxWidth: "800px" }}>
            <div className="modal-header">
              <h3>{roleModal.mode === "create" ? "Create New Role" : `Edit Role: ${roleModal.data.RoleName}`}</h3>
              <button className="modal-close" onClick={() => setRoleModal(null)}><HiOutlineX /></button>
            </div>
            <form onSubmit={handleSaveRole}>
              <div className="grid grid-2">
                <div className="form-group">
                  <label>Role Name</label>
                  <input type="text" className="form-input" required
                    value={roleModal.data.roleName || roleModal.data.RoleName || ""}
                    onChange={e => setRoleModal(p => ({ ...p, data: { ...p.data, roleName: e.target.value } }))}
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <input type="text" className="form-input"
                    value={roleModal.data.description || roleModal.data.Description || ""}
                    onChange={e => setRoleModal(p => ({ ...p, data: { ...p.data, description: e.target.value } }))}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: "16px" }}>
                <label>Permissions ({(roleModal.data.permissions || []).length} selected)</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginTop: "12px", background: "var(--bg-secondary)", padding: "16px", borderRadius: "8px" }}>
                  {availablePermissions.map(perm => (
                    <label key={perm} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px" }}>
                      <input 
                        type="checkbox" 
                        checked={(roleModal.data.permissions || []).includes(perm)}
                        onChange={() => togglePermission(perm)}
                        style={{ accentColor: "var(--primary)", width: "16px", height: "16px" }}
                      />
                      {perm}
                    </label>
                  ))}
                </div>
              </div>

              <div className="modal-footer" style={{ marginTop: "24px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setRoleModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Role</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminManagement;
