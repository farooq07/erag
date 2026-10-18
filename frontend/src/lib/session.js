// Session handling: the short-lived access token lives only in memory (never
// localStorage, so injected scripts can't lift a long-lived credential). The
// refresh token is an httpOnly cookie the browser sends to /api/auth/* only.

const API = "/api";

let accessToken = "";
let refreshing = null;

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token || "";
}

export function authHeader() {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

// Exchange the refresh cookie for a new access token. Concurrent callers share
// one request. Returns the user on success, null when there's no valid session.
export function refreshSession() {
  if (!refreshing) {
    refreshing = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await fetch(`${API}/auth/refresh`, { method: "POST" });
        if (r.ok) {
          const d = await r.json();
          setAccessToken(d.access_token);
          return d.user;
        }
        // Another tab may have just rotated the cookie; retry once with it.
        await new Promise((res) => setTimeout(res, 300));
      }
      setAccessToken("");
      return null;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

// fetch() with the access token attached; on 401 refreshes once and retries.
export async function apiFetch(url, opts = {}) {
  const send = () => fetch(url, { ...opts, headers: { ...(opts.headers || {}), ...authHeader() } });
  let r = await send();
  if (r.status === 401 && !url.includes("/auth/")) {
    if (await refreshSession()) r = await send();
  }
  return r;
}

export async function logout() {
  try {
    await fetch(`${API}/auth/logout`, { method: "POST" });
  } finally {
    setAccessToken("");
  }
}
