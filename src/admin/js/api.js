class ApiClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl || '';
  }

  getToken() {
    return localStorage.getItem('admin_token');
  }

  async request(method, path, body, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const fetchOpts = { method, headers };
    if (body && method !== 'GET') fetchOpts.body = JSON.stringify(body);

    let res;
    try {
      res = await fetch(this.baseUrl + path, fetchOpts);
    } catch {
      throw new Error('Network error — check your connection');
    }

    if (res.status === 401 && !opts.allow401) {
      this.logout();
      return undefined;
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = (typeof errBody.error === 'string' ? errBody.error : errBody.error?.message) || `Request failed: ${res.status}`;
      throw new Error(msg);
    }

    const json = await res.json();
    if (json && Array.isArray(json.data) && json.pagination) return json.data;
    return json;
  }

  get(path) { return this.request('GET', path); }
  post(path, body) { return this.request('POST', path, body); }
  put(path, body) { return this.request('PUT', path, body); }
  del(path) { return this.request('DELETE', path); }

  async login(email, password) {
    const data = await this.request('POST', '/api/auth/login', { email, password }, { allow401: true });
    if (data === undefined) {
      throw new Error('Invalid email or password');
    }
    if (data && data.token) {
      localStorage.setItem('admin_token', data.token);
    }
    return data;
  }

  logout() {
    localStorage.removeItem('admin_token');
    window.location.href = 'login.html';
  }
}

window.api = new ApiClient();

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
window.esc = esc;

function statusBadge(status) {
  const map = {
    active: 'success', approved: 'success',
    draft: 'secondary', pending: 'warning', trial: 'warning',
    inactive: 'danger', rejected: 'danger', expired: 'danger',
    refund: 'danger',
  };
  const cls = map[status] || 'secondary';
  return `<span class="badge badge--${cls}">${esc(status)}</span>`;
}
window.statusBadge = statusBadge;

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return esc(dateStr);
    return d.toLocaleDateString('ru-RU');
  } catch {
    return esc(dateStr);
  }
}
window.formatDate = formatDate;
