import axios from 'axios';

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1').replace(/\/$/, '');
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_URL.replace(/\/api\/v\d+$/, '');

const SESSION_FLAG = 'fjw_session';
const DEVICE_KEY = 'fjw_device_id';

let accessToken = null;
let onSessionExpired = () => {};

export const setAccessToken = (token) => {
  accessToken = token;
  try {
    if (token) localStorage.setItem(SESSION_FLAG, '1');
    else localStorage.removeItem(SESSION_FLAG);
  } catch {
    /* storage blocked */
  }
};
export const getAccessToken = () => accessToken;
export const hasSessionHint = () => {
  try {
    return localStorage.getItem(SESSION_FLAG) === '1';
  } catch {
    return false;
  }
};
export const setSessionExpiredHandler = (fn) => {
  onSessionExpired = fn;
};

function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

function deviceName() {
  const ua = navigator.userAgent;
  const browser = /Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return `${browser}${os ? ` on ${os}` : ''}`;
}

const clientHeaders = () => ({ 'X-Client-Platform': 'web', 'X-Device-Id': deviceId(), 'X-Device-Name': deviceName() });

export class ApiError extends Error {
  constructor({ status, code, message, details, requestId }) {
    super(message || 'Something went wrong. Please try again.');
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /** { fieldName: message } for mapping validation errors onto form inputs. */
  get fieldErrors() {
    return Object.fromEntries((this.details || []).filter((d) => d.field).map((d) => [d.field, d.message]));
  }
}

async function toApiError(error) {
  const res = error.response;
  if (!res) return new ApiError({ code: 'NETWORK_ERROR', message: 'Could not reach the server. Check your connection and try again.' });
  let body = res.data;
  if (body instanceof Blob) {
    try {
      body = JSON.parse(await body.text());
    } catch {
      body = {};
    }
  }
  return new ApiError({ status: res.status, code: body?.error?.code, message: body?.error?.message, details: body?.error?.details, requestId: body?.requestId });
}

const http = axios.create({ baseURL: API_URL, withCredentials: true, timeout: 30000 });

let refreshing = null;

/** Single-flight refresh: concurrent 401s wait for one rotation (old tokens are single use). */
export function refreshSession() {
  if (!refreshing) {
    refreshing = axios
      .post(`${API_URL}/auth/refresh`, {}, { withCredentials: true, headers: clientHeaders(), timeout: 15000 })
      .then((res) => {
        setAccessToken(res.data.data.tokens.accessToken);
        return accessToken;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

http.interceptors.request.use((config) => {
  Object.assign(config.headers, clientHeaders());
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

http.interceptors.response.use(
  (res) => (res.config.responseType === 'blob' ? res : res.data),
  async (error) => {
    const original = error.config;
    const code = error.response?.data?.error?.code;
    if (error.response?.status === 401 && code === 'TOKEN_EXPIRED' && original && !original._retried) {
      original._retried = true;
      try {
        await refreshSession();
        return await http(original);
      } catch (refreshError) {
        if (refreshError.response?.status === 401) {
          setAccessToken(null);
          onSessionExpired();
        }
        throw await toApiError(refreshError);
      }
    }
    if (error.response?.status === 401 && ['SESSION_REVOKED', 'TOKEN_REVOKED', 'USER_NOT_FOUND'].includes(code)) {
      setAccessToken(null);
      onSessionExpired();
    }
    throw await toApiError(error);
  },
);

export default http;

/** Downloads a file response (Excel / CSV / ZIP) using the name from Content-Disposition. */
export async function downloadFile(url, { params, method = 'get', data, fallbackName = 'download' } = {}) {
  const res = await http.request({ url, method, params, data, responseType: 'blob', timeout: 120000 });
  const disposition = res.headers['content-disposition'] || '';
  const name = disposition.match(/filename="?([^";]+)"?/)?.[1] || fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
  URL.revokeObjectURL(href);
}

/** Reads an authenticated HTML response (GST invoice) as text. */
export async function fetchHtml(url, params) {
  return http.request({ url, params, responseType: 'text' });
}

export const toFormData = (fields = {}) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    if (value instanceof File) form.append(key, value);
    else if (typeof value === 'object') form.append(key, JSON.stringify(value));
    else form.append(key, String(value));
  }
  return form;
};
