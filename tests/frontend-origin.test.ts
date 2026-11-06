import { afterEach, describe, expect, it, vi } from "vitest";
import { frontend } from "../src/server/frontend";
import type { AppBindings } from "../src/server/types";

const env = { APP_ENV: "production", FRONTEND_ORIGIN: "https://saladfinder.defcron.chatgpt.site" } as AppBindings;
afterEach(() => vi.unstubAllGlobals());
describe("Sites frontend gateway", () => {
  it("serves deep links without exposing visitor credentials or queries", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response("SPA", { headers: { "Content-Type": "text/html", "Set-Cookie": "unexpected=1" } }));
    vi.stubGlobal("fetch", upstream);
    const response = await frontend(new Request("https://saladfinder.com/auth/verify?token=private", { headers: { Cookie: "session=private", Authorization: "Bearer private", Referer: "https://saladfinder.com/private" } }), env);
    expect(upstream.mock.calls[0][0].href).toBe("https://saladfinder.defcron.chatgpt.site/");
    expect(upstream.mock.calls[0][1]).toEqual({ method: "GET", redirect: "manual" });
    expect(await response.text()).toBe("SPA");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
  });
  it("serves the recovery UI with HTTP 404 for an unknown page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("SPA")));
    const response = await frontend(new Request("https://saladfinder.com/missing"), env);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("SPA");
  });
  it.each(["/assets/app.js", "/brand/logo.svg", "/favicon.svg", "/apple-touch-icon.png", "/robots.txt", "/sites-canonical.js"])("preserves asset path %s and strips query", async (path) => {
    const upstream = vi.fn().mockResolvedValue(new Response("asset"));
    vi.stubGlobal("fetch", upstream);
    const response = await frontend(new Request(`https://saladfinder.com${path}?secret=private`), env);
    expect(upstream.mock.calls[0][0].href).toBe(`https://saladfinder.defcron.chatgpt.site${path}`);
    expect(response.status).toBe(200);
  });
  it("preserves missing asset 404s and HEAD responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    const response = await frontend(new Request("https://saladfinder.com/assets/missing.js", { method: "HEAD" }), env);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-cache");
  });
  it.each([302, 403, 500])("fails closed for upstream status %s", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private", { status, headers: { Location: "https://evil.example" } })));
    const response = await frontend(new Request("https://saladfinder.com/"), env);
    expect(response.status).toBe(503);
    expect(response.headers.has("location")).toBe(false);
  });
  it("uses local assets when Sites is disabled", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("local"));
    const response = await frontend(new Request("http://localhost/"), { ...env, APP_ENV: "local", ASSETS: { fetch } } as unknown as AppBindings);
    expect(await response.text()).toBe("local");
  });
});
