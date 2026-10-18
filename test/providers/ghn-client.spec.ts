import { GhnClient, GhnError } from "../../src/providers/ghn/ghn-client";

const config = { token: "secret-token-value", shopId: "123", baseUrl: "https://ghn.example.invalid" };
const item = (id: number) => ({ _id: id, name: `Name ${id}`, extension_names: ["n"], type: "province", parent_id: 1, status: 1 });
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("GhnClient", () => {
  it("sends GET with Token and ShopId and maps the documented fields", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(reply({ code: 200, data: [item(7)] }));
    const units = await new GhnClient(config, fetchImpl, 0).provinces();
    expect(units).toEqual([{ id: 7, name: "Name 7", extensionNames: ["n"], status: 1, parentId: 1 }]);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ghn.example.invalid/shiip/public-api/v3/master-data/province/all?offset=0&limit=200");
    expect(init).toMatchObject({ method: "GET", headers: { Token: "secret-token-value", ShopId: "123" } });
  });

  it("asks for the next page while pages are full", async () => {
    const full = Array.from({ length: 200 }, (_, i) => item(i + 1));
    const fetchImpl = jest.fn().mockResolvedValueOnce(reply({ code: 200, data: full })).mockResolvedValueOnce(reply({ code: 200, data: [item(999)] }));
    const units = await new GhnClient(config, fetchImpl, 0).provinces();
    expect(units).toHaveLength(201);
    expect(fetchImpl.mock.calls[1]?.[0]).toContain("offset=200");
  });

  it("retries a 500 and then succeeds", async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(reply({}, 500)).mockResolvedValueOnce(reply({ code: 200, data: [item(1)] }));
    expect(await new GhnClient(config, fetchImpl, 0).provinces()).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after three tries without leaking the token", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(reply({}, 503));
    const error = await new GhnClient(config, fetchImpl, 0).provinces().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GhnError);
    expect(String((error as Error).message)).not.toContain("secret-token-value");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("explains a 401 without retrying", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(reply({}, 401));
    await expect(new GhnClient(config, fetchImpl, 0).provinces()).rejects.toThrow(/IP allow-list/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("treats data:null for a ward request as a wrong province id", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(reply({ code: 200, data: null }));
    await expect(new GhnClient(config, fetchImpl, 0).wards(42)).rejects.toThrow("no wards for province 42");
  });

  it("rejects a response that does not have the documented shape", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(reply({ code: 200, data: [{ name: "x" }] }));
    await expect(new GhnClient(config, fetchImpl, 0).provinces()).rejects.toThrow("documented shape");
  });
});
