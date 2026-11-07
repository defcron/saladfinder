import { describe, expect, it, vi } from "vitest";
import { frontend } from "../src/server/frontend";

describe("Workers Static Assets frontend", () => {
  it("serves a client route with security headers and no-cache HTML", async () => {
    const assets = { fetch: vi.fn().mockResolvedValue(new Response("SPA")) };
    const response = await frontend(
      new Request("https://saladfinder.com/auth/verify?token=private"),
      { ASSETS: assets },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("SPA");
    expect(assets.fetch).toHaveBeenCalledOnce();
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers.get("x-saladfinder-frontend")).toBe(
      "workers-static-assets",
    );
  });

  it("keeps hashed assets immutable, preserves missing assets, and returns HEAD without a body", async () => {
    const assets = {
      fetch: vi
        .fn()
        .mockResolvedValueOnce(new Response("js"))
        .mockResolvedValueOnce(
          new Response("<html>SPA</html>", {
            headers: { "Content-Type": "text/html" },
          }),
        ),
    };
    const asset = await frontend(
      new Request("https://saladfinder.com/assets/index-abc12345.js"),
      { ASSETS: assets },
    );
    expect(asset.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    const missing = await frontend(
      new Request("https://saladfinder.com/assets/missing.js", {
        method: "HEAD",
      }),
      { ASSETS: assets },
    );
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("");
  });

  it("does not turn successful non-HTML files such as brand images into 404s", async () => {
    const response = await frontend(
      new Request("https://saladfinder.com/brand/logo.svg"),
      {
        ASSETS: {
          fetch: vi.fn().mockResolvedValue(
            new Response("<svg />", {
              headers: { "Content-Type": "image/svg+xml" },
            }),
          ),
        },
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
  });

  it("serves the SPA recovery screen with an HTTP 404 on unknown routes", async () => {
    const response = await frontend(
      new Request("https://saladfinder.com/not-a-route"),
      {
        ASSETS: {
          fetch: vi.fn().mockResolvedValue(
            new Response("SPA", {
              headers: { "Content-Type": "text/html" },
            }),
          ),
        },
      },
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("SPA");
  });
});
