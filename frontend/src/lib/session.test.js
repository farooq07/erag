import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, getAccessToken, logout, refreshSession, setAccessToken } from "./session";

const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

describe("session", () => {
  beforeEach(() => setAccessToken(""));

  it("dedupes concurrent refreshes into one request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { access_token: "t1", user: { id: "u" } }));
    vi.stubGlobal("fetch", fetchMock);

    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ id: "u" });
    expect(b).toEqual({ id: "u" });
    expect(getAccessToken()).toBe("t1");
  });

  it("retries a request once after refreshing on 401", async () => {
    setAccessToken("stale");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(401, {}))                                   // original request
      .mockResolvedValueOnce(json(200, { access_token: "fresh", user: {} }))  // /auth/refresh
      .mockResolvedValueOnce(json(200, { ok: true }));                        // retried request
    vi.stubGlobal("fetch", fetchMock);

    const r = await apiFetch("/api/documents");

    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer fresh");
  });

  it("does not refresh for auth endpoints", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(401, {}));
    vi.stubGlobal("fetch", fetchMock);

    const r = await apiFetch("/api/auth/me");

    expect(r.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("logout clears the access token", async () => {
    setAccessToken("t");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(200, { ok: true })));
    await logout();
    expect(getAccessToken()).toBe("");
  });
});
