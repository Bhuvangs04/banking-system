import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { adminApi } from "../utlis/api";
import { HiOutlineCog, HiOutlineSave } from "react-icons/hi";

const AdminSettings = ({ hasPermission }) => {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = async () => {
    try {
      const response = await adminApi.get("/admin/settings");
      const settingsMap = {};
      response.data.settings.forEach(s => {
        settingsMap[s.SettingKey] = {
          value: s.SettingValue,
          description: s.Description
        };
      });
      setSettings(settingsMap);
    } catch (err) {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSettingChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: { ...prev[key], value }
    }));
  };

  const handleSaveSetting = async (key) => {
    setSaving(true);
    try {
      await adminApi.put("/admin/settings", {
        key,
        value: settings[key].value
      });
      toast.success("Setting updated successfully");
      fetchSettings(); // Refresh from DB
    } catch (err) {
      toast.error("Failed to update setting");
    } finally {
      setSaving(false);
    }
  };

  if (!hasPermission("manage_settings")) {
    return (
      <div className="animate-fade-in" style={{ padding: "40px", textAlign: "center" }}>
        <h3 style={{ color: "var(--error)" }}>Access Denied</h3>
        <p>You do not have permission to view or modify system settings.</p>
      </div>
    );
  }

  if (loading) return <div>Loading settings...</div>;

  const settingGroups = [
    {
      title: "Loan Interest Rates (Base)",
      keys: ["LOAN_BASE_RATE_SAVINGS", "LOAN_BASE_RATE_CURRENT"]
    },
    {
      title: "Late Fee Parameters",
      keys: ["LATE_FEE_FIXED_AMOUNT", "LATE_FEE_PERCENTAGE"]
    }
  ];

  return (
    <div className="animate-fade-in" style={{ maxWidth: "800px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "32px" }}>
        <div style={{ padding: "12px", background: "var(--bg-secondary)", borderRadius: "12px" }}>
          <HiOutlineCog size={28} color="var(--primary)" />
        </div>
        <div>
          <h2 style={{ fontSize: "24px", margin: 0 }}>System Settings</h2>
          <p style={{ margin: 0, color: "var(--text-muted)" }}>Configure global banking parameters and rates</p>
        </div>
      </div>

      {settingGroups.map(group => {
        // Only render group if settings exist
        if (!group.keys.some(k => settings[k])) return null;

        return (
          <div key={group.title} className="table-container" style={{ marginBottom: "24px", padding: "24px" }}>
            <h3 style={{ fontSize: "18px", marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid var(--border)" }}>
              {group.title}
            </h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {group.keys.map(key => {
                const setting = settings[key];
                if (!setting) return null;

                return (
                  <div key={key} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "24px", alignItems: "center" }}>
                    <div>
                      <label style={{ display: "block", fontWeight: "600", marginBottom: "4px" }}>
                        {key.split('_').join(' ')}
                      </label>
                      <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>
                        {setting.description}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: "12px" }}>
                      <input 
                        type="text" 
                        className="form-input" 
                        style={{ width: "120px" }}
                        value={setting.value}
                        onChange={(e) => handleSettingChange(key, e.target.value)}
                      />
                      <button 
                        className="btn btn-primary"
                        onClick={() => handleSaveSetting(key)}
                        disabled={saving}
                      >
                        <HiOutlineSave /> Save
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AdminSettings;
