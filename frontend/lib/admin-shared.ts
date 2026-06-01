export interface AdminUser {
  username:   string;
  name:       string;
  email:      string;
  role:       'admin' | 'investigator' | 'analyst' | 'branch_manager';
  initials:   string;
  status:     'active' | 'suspended';
  last_login: number | null;
}

export interface AdminUsersResponse {
  rows:      AdminUser[];
  total:     number;
  suspended: number;
  invited:   number;
}

export interface AdminPermissionRow {
  id:                  string;
  label:               string;
  required_permission: string;
  analyst:             boolean;
  investigator:        boolean;
  admin:               boolean;
}

export interface AdminPermissionsResponse {
  roles: string[];
  rows:  AdminPermissionRow[];
  note:  string;
}

export interface AdminApiKey {
  id:         string;
  label:      string;
  scope:      string;
  hash_short: string;
  created_at: number;
  last_used:  number | null;
}

export interface AdminApiKeysResponse {
  rows:  AdminApiKey[];
  total: number;
}

export interface AdminConfigResponse {
  rate_limiting: {
    requests_per_minute:       string;
    burst:                     string;
    concurrent_investigations: string;
    str_per_hour:              string;
  };
  session: {
    jwt_expiry_minutes:   number;
    idle_timeout_minutes: number;
    mfa_required_for:     string;
  };
  paths: {
    audit_log:      string;
    model_dir:      string;
    data_dir:       string;
    pending_alerts: string;
    api_keys:       string;
  };
  escalation: {
    timeout_seconds: number;
    tick_seconds:    number;
    webhook_url:     string;
  };
}
