import assert from "node:assert/strict";
import test from "node:test";
import plugin from "./index.mjs";
import { DOMESTIC_API_BASE as domestic, INTERNATIONAL_API_BASE as international, resolveApiBase, routeApiURL } from "./endpoints.mjs";

const modelKey = "synthetic-endpoint-model-key";
const authRecord = extra => ({ type: "api", key: modelKey, ...extra });
const ok = () => new Response("synthetic-ok", { headers: { "content-type": "text/plain" } });
function stubFetch(t, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  t.after(() => { globalThis.fetch = original; });
}
async function setup({ settings = {}, auth = authRecord(), provider = {} } = {}) {
  const options = { "portable-responses": false, "text-filter": false, "send-codex-headers": false, ...settings };
  const p = await plugin({ magpie: { option: (id, key) => { assert.equal(id, "agentrouter"); return options[key]; } } });
  const loader = await p.auth.loader(async () => auth, provider);
  return { p, loader, options };
}
function captureWire(t, beforeRead) {
  const calls = [];
  stubFetch(t, async (input, init) => {
    beforeRead?.(input, init);
    // Exercise native Fetch input/init composition, not just the adapter's init.
    const wire = new Request(input, init);
    wire.signal.throwIfAborted();
    calls.push({ url: wire.url, method: wire.method, headers: wire.headers, signal: wire.signal,
      body: await wire.text(), input, init });
    return ok();
  });
  return calls;
}
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

for (const [label, account, provider, on, expected] of [
  ["default domestic", {}, {}, undefined, domestic],
  ["off is international", {}, {}, false, international],
  ["on is domestic", {}, {}, true, domestic],
  ["account root wins", { endpoint: "https://relay.test" }, {}, true, "https://relay.test/v1"],
  ["endpoint already /v1", { endpoint: " https://relay.test/proxy/v1/// " }, {}, false, "https://relay.test/proxy/v1"],
  ["provider root prefix", {}, { endpoint: "http://relay.test:8080/proxy/" }, true, "http://relay.test:8080/proxy/v1"],
  ["complete account apiBase", { apiBase: "https://relay.test/openai/" }, {}, true, "https://relay.test/openai"],
  ["complete provider apiBase", {}, { apiBase: "https://relay.test/custom/v1" }, false, "https://relay.test/custom/v1"],
  ["account endpoint before provider endpoint", { endpoint: "https://account.test" }, { endpoint: "https://provider.test" }, false, "https://account.test/v1"],
  ["provider endpoint before account apiBase", { apiBase: "https://account.test/v1" }, { endpoint: "https://provider.test" }, true, "https://provider.test/v1"],
  ["account apiBase before provider apiBase", { apiBase: "https://account.test/v2" }, { apiBase: "https://provider.test/v3" }, true, "https://account.test/v2"],
  ["misplaced endpoint key ignored", { endpoint: modelKey }, {}, true, domestic],
  ["legacy non-URL falls through to provider", { endpoint: modelKey }, { endpoint: "https://provider.test" }, true, "https://provider.test/v1"],
  ["legacy non-URL apiBase ignored", { apiBase: modelKey }, {}, false, international],
]) test("endpoint selection: " + label, () => {
  assert.equal(resolveApiBase(account, provider, on), expected);
});

test("unsafe explicit URL configuration fails closed without echoing values or falling back", () => {
  const invalid = [
    "https://synthetic-private:synthetic-private@relay.test", "http://synthetic-private@relay.test",
    "https://relay.test/v1?secret=synthetic-private", "https://relay.test/v1#synthetic-private",
    "https://relay.test/v1?", "https://relay.test/v1#", "ftp://relay.test", "javascript:synthetic-private",
    "https://", "https://relay.test/ synthetic-private", "https://relay.test\\synthetic-private", "https://relay.test/\nsynthetic-private",
  ];
  for (const value of invalid) for (const field of ["endpoint", "apiBase"]) {
    assert.throws(() => resolveApiBase({ [field]: value }, {}, true), error =>
      error.code === "agentrouter_invalid_endpoint" && !error.message.includes("synthetic-private"));
  }
  // Lower-priority broken fields are irrelevant when an explicit endpoint won.
  assert.equal(resolveApiBase({ endpoint: "https://chosen.test", apiBase: invalid[0] }, {}, true), "https://chosen.test/v1");
});

test("URL routing preserves encoded paths, duplicate query keys, query order and fragments", () => {
  const input = international + "/files/file%2Fid?x=1&x=2&encoded=%2F%20&empty=#fragment";
  assert.equal(routeApiURL(input, domestic, international), domestic + "/files/file%2Fid?x=1&x=2&encoded=%2F%20&empty=#fragment");
  assert.equal(routeApiURL(domestic + "/responses?x=1", "https://relay.test/prefix/v1", domestic), "https://relay.test/prefix/v1/responses?x=1");
  assert.equal(routeApiURL("https://agentrouter.org/proxy/v1/responses", "https://agentrouter.org/proxy/v1", international), "https://agentrouter.org/proxy/v1/responses");
});

test("cached loader and model URLs obey the next boolean setting, without duplicate calls", async t => {
  const calls = captureWire(t);
  const { p, loader, options } = await setup();
  assert.equal(loader.baseURL, domestic);
  const cachedModelURL = new URL(loader.baseURL + "/responses?stream=true&tag=a&tag=b");
  const init = { method: "POST", body: "{\"input\":\"synthetic\"}" };
  await loader.fetch(cachedModelURL, init);
  options["use-domestic-api"] = false;
  await loader.fetch(cachedModelURL, init);
  options["use-domestic-api"] = true;
  await loader.fetch(cachedModelURL, init);
  assert.deepEqual(calls.map(call => call.url), [domestic, international, domestic].map(base => base + "/responses?stream=true&tag=a&tag=b"));
  assert.equal(loader.baseURL, domestic, "SDK's cached base stays unchanged; the live fetch seam does the routing");
  const cfg = {};
  await p.config(cfg); await p.config(cfg);
  assert.deepEqual(Object.keys(cfg.provider), ["agentrouter"]);
  assert.equal(cfg.provider.agentrouter.api, domestic);
  assert.deepEqual(Object.keys(cfg.provider.agentrouter.models), ["gpt-5.6-sol", "gpt-6-astra", "gpt-6.1-sol"]);
});

test("old hosts without a boolean reader also use the new package's domestic default", async t => {
  const calls = captureWire(t);
  const p = await plugin();
  const loader = await p.auth.loader(async () => authRecord(), {});
  await loader.fetch(international + "/models");
  assert.equal(loader.baseURL, domestic);
  assert.equal(calls[0].url, domestic + "/models");
});

test("independent plugin instances do not share endpoint state", async t => {
  const calls = captureWire(t);
  const first = await setup({ settings: { "use-domestic-api": true } });
  const second = await setup({ settings: { "use-domestic-api": false } });
  await first.loader.fetch(first.loader.baseURL + "/models");
  await second.loader.fetch(second.loader.baseURL + "/models");
  first.options["use-domestic-api"] = false;
  await first.loader.fetch(first.loader.baseURL + "/models");
  await second.loader.fetch(second.loader.baseURL + "/models");
  assert.deepEqual(calls.map(call => call.url), [domestic, international, international, international].map(base => base + "/models"));
});

for (const [label, auth, provider, expected] of [
  ["nested account endpoint", authRecord({ metadata: { endpoint: "https://relay.test/proxy/v1/" } }), {}, "https://relay.test/proxy/v1"],
  ["flat account endpoint", authRecord({ endpoint: "http://relay.test:8080/api" }), {}, "http://relay.test:8080/api/v1"],
  ["provider endpoint", authRecord(), { endpoint: "https://relay.test/gateway" }, "https://relay.test/gateway/v1"],
  ["nested account apiBase", authRecord({ metadata: { apiBase: "https://relay.test/openai" } }), {}, "https://relay.test/openai"],
  ["flat account apiBase", authRecord({ apiBase: "https://relay.test/openai" }), {}, "https://relay.test/openai"],
  ["provider apiBase", authRecord(), { apiBase: "https://relay.test/openai" }, "https://relay.test/openai"],
  ["provider endpoint beats account apiBase", authRecord({ metadata: { apiBase: "https://account.test/v1" } }), { endpoint: "https://relay.test" }, "https://relay.test/v1"],
]) test("real loader retains explicit custom overrides: " + label, async t => {
  const calls = captureWire(t);
  const { loader, options } = await setup({ auth, provider });
  assert.equal(loader.baseURL, expected);
  await loader.fetch(loader.baseURL + "/responses?x=%2F&x=2", { method: "POST", body: "synthetic-body" });
  options["use-domestic-api"] = false;
  await loader.fetch(loader.baseURL + "/responses?x=%2F&x=2", { method: "POST", body: "synthetic-body" });
  assert.deepEqual(calls.map(call => call.url), [expected + "/responses?x=%2F&x=2", expected + "/responses?x=%2F&x=2"]);
  assert.ok(calls.every(call => call.headers.get("authorization") === "Bearer " + modelKey));
});

test("clearing a legacy explicit vendor endpoint enables the next selector value", async t => {
  const calls = captureWire(t);
  const auth = authRecord({ metadata: { endpoint: "https://agentrouter.org" } });
  const { loader, options } = await setup({ auth });
  await loader.fetch(loader.baseURL + "/models");
  options["use-domestic-api"] = false;
  await loader.fetch(loader.baseURL + "/models");
  auth.metadata.endpoint = "";
  options["use-domestic-api"] = true;
  await loader.fetch(loader.baseURL + "/models");
  assert.deepEqual(calls.map(call => call.url), [international, international, domestic].map(base => base + "/models"));
});

test("a cached custom base may be retargeted only to the current explicit choice", async t => {
  const calls = captureWire(t);
  const auth = authRecord({ endpoint: "https://first.test/proxy" });
  const { loader } = await setup({ auth });
  auth.endpoint = "https://second.test/other/v1";
  await loader.fetch(loader.baseURL + "/responses?keep=%2F", { method: "POST", body: "{}" });
  assert.equal(calls[0].url, "https://second.test/other/v1/responses?keep=%2F");
});

test("foreign origins, wrong prefixes and credentials never receive a key or a body read", async t => {
  let calls = 0;
  stubFetch(t, async () => { calls++; throw new Error("network must not run"); });
  const { loader } = await setup();
  const urls = [
    "https://foreign.test/v1/responses", "https://agentrouter.org.evil.test/v1/responses",
    "http://agentrouter.org/v1/responses", "https://agentrouter.org:8443/v1/responses",
    "https://agentrouter.org/v10/responses", "https://agentrouter.org/v1-other/responses",
    "https://agentrouter.org/api/user/self", "https://agentrouter.org/v1/../../api/user/self",
    "https://synthetic-private@agentrouter.org/v1/responses", "data:text/plain,synthetic-private",
  ];
  for (const url of urls) {
    const result = await loader.fetch(url, { method: "POST", body: "synthetic-private" });
    assert.equal(result.status, 400);
    const text = await result.text();
    assert.equal(JSON.parse(text).error.code, "agentrouter_untrusted_request_url");
    assert.equal(text.includes("synthetic-private"), false);
  }
  const request = new Request(urls[0], { method: "POST", body: "synthetic-private" });
  request.clone = () => { throw new Error("untrusted Request must not be cloned"); };
  assert.equal((await loader.fetch(request)).status, 400);
  assert.equal(request.bodyUsed, false);
  assert.equal(request.body.locked, false);
  assert.equal(calls, 0);
});

test("an unsafe runtime override does not silently send on a previously selected base", async t => {
  let calls = 0;
  stubFetch(t, async () => { calls++; throw new Error("network must not run"); });
  const auth = authRecord({ endpoint: "https://custom.test" });
  const { loader } = await setup({ auth });
  auth.endpoint = "https://synthetic-private@foreign.test";
  const request = new Request(loader.baseURL + "/responses", { method: "POST", body: "synthetic-private" });
  const result = await loader.fetch(request);
  assert.equal(result.status, 400);
  assert.equal((await result.json()).error.code, "agentrouter_invalid_endpoint");
  assert.equal(request.bodyUsed, false);
  assert.equal(calls, 0);
  await assert.rejects(setup({ auth }), error => error.code === "agentrouter_invalid_endpoint" && !error.message.includes("synthetic-private"));
});

for (const [label, headers] of [
  ["object", { "X-Init": "init", Cookie: "synthetic-init-cookie", Authorization: "Bearer synthetic-management-token" }],
  ["tuples", [["X-Init", "init"], ["Cookie", "synthetic-init-cookie"], ["Authorization", "Bearer synthetic-management-token"]]],
  ["Headers", new Headers({ "X-Init": "init", Cookie: "synthetic-init-cookie", Authorization: "Bearer synthetic-management-token" })],
]) test("cross-origin routing merges headers without forwarding origin credentials: " + label, async t => {
  const calls = captureWire(t);
  const auth = authRecord({ metadata: { headers: "X-Account: account\nCookie: synthetic-account-cookie", accessToken: "synthetic-private-access", cookie: "session=synthetic-private-site" } });
  const provider = { headers: "X-Provider: provider\nCookie2: synthetic-provider-cookie", models: { model: { headers: { "X-Model": "model" } } } };
  const { loader } = await setup({ auth, provider });
  const request = new Request(international + "/responses?raw=%2F", { method: "POST", body: "synthetic-body", headers: {
    Cookie: "synthetic-request-cookie", "Proxy-Authorization": "synthetic-proxy", "New-Api-User": "synthetic-private-user",
    "X-Request": "request", "x-session-id": "synthetic-session-id", "content-type": "text/plain", "content-length": "14",
  } });
  await loader.fetch(request, { headers });
  const sent = calls[0];
  assert.equal(sent.url, domestic + "/responses?raw=%2F");
  assert.equal(sent.body, "synthetic-body");
  for (const name of ["cookie", "cookie2", "proxy-authorization", "new-api-user"]) assert.equal(sent.headers.has(name), false);
  for (const [name, value] of [["x-init", "init"], ["x-account", "account"], ["x-provider", "provider"], ["x-model", "model"], ["x-request", "request"], ["x-session-id", "synthetic-session-id"], ["content-length", "14"]]) assert.equal(sent.headers.get(name), value);
  assert.equal(sent.headers.get("authorization"), "Bearer " + modelKey);
  assert.equal(JSON.stringify([...sent.headers]).includes("synthetic-private"), false);
});

test("body replay cannot reintroduce Request-scoped credentials after cross-origin selection", async t => {
  const calls = captureWire(t);
  const { loader } = await setup({ settings: { "portable-responses": true } });
  const request = new Request(international + "/responses", { method: "POST", body: JSON.stringify({ input: [
    { type: "function_call", id: "fc_synthetic", call_id: "call_synthetic", name: "lookup", arguments: "{}" },
  ] }), headers: { "content-type": "application/json", Cookie: "synthetic-site-cookie", Cookie2: "synthetic-site-cookie2",
    "Proxy-Authorization": "synthetic-proxy-token", "New-Api-User": "42" } });
  await loader.fetch(request);
  for (const name of ["cookie", "cookie2", "proxy-authorization", "new-api-user"]) assert.equal(calls[0].headers.has(name), false, name);
  assert.equal(JSON.parse(calls[0].body).input[0].id, undefined);
  assert.equal(calls[0].headers.get("authorization"), "Bearer " + modelKey);
});

test("same-origin routing preserves explicitly supplied headers and only replaces model Authorization", async t => {
  const calls = captureWire(t);
  const { loader } = await setup({ settings: { "use-domestic-api": false } });
  await loader.fetch(international + "/responses", { method: "POST", body: "{}", headers: { Cookie: "synthetic-cookie", Authorization: "synthetic-placeholder", "X-Keep": "keep" } });
  assert.equal(calls[0].headers.get("cookie"), "synthetic-cookie");
  assert.equal(calls[0].headers.get("x-keep"), "keep");
  assert.equal(calls[0].headers.get("authorization"), "Bearer " + modelKey);
});

for (const shape of ["string", "URL", "Request inherited", "Request replacement", "Request empty replacement", "Request null body", "Request undefined overrides"]) {
  test("actual Fetch composition preserves transport: " + shape, async t => {
    const controller = new AbortController();
    let original;
    const calls = captureWire(t, () => { if (original && !shape.includes("replacement")) assert.equal(original.bodyUsed, false); });
    const { loader } = await setup();
    const source = international + "/responses?query=a%2Fb&query=second";
    const body = "synthetic-original-body";
    let input = shape === "URL" ? new URL(source) : source;
    let init = { method: "PUT", body, signal: controller.signal, headers: { "X-Keep": "keep" } };
    let expectedBody = body;
    if (shape.startsWith("Request")) {
      original = input = new Request(source, { method: "PUT", body, signal: controller.signal, headers: { "X-Keep": "keep" }, redirect: "manual", cache: "no-store", referrerPolicy: "no-referrer" });
      original.clone = () => { throw new Error("transport-only routing must not clone bodies"); };
      init = {};
      if (shape === "Request replacement") { init = { method: "PATCH", body: "synthetic-replacement", signal: controller.signal }; expectedBody = init.body; }
      if (shape === "Request empty replacement") { init.body = ""; expectedBody = ""; }
      if (shape === "Request null body") init.body = null;
      if (shape === "Request undefined overrides") init = { method: undefined, signal: undefined, body: undefined, cache: undefined, redirect: undefined };
    }
    await loader.fetch(input, init);
    const sent = calls[0];
    assert.equal(sent.url, domestic + "/responses?query=a%2Fb&query=second");
    assert.equal(sent.method, shape === "Request replacement" ? "PATCH" : "PUT");
    assert.equal(sent.body, expectedBody);
    assert.equal(sent.headers.get("x-keep"), "keep");
    controller.abort(); assert.equal(sent.signal.aborted, true);
    if (original && shape.includes("replacement")) assert.equal(await original.text(), body);
    if (original) { assert.equal(sent.input.redirect, "manual"); assert.equal(sent.input.cache, "no-store"); assert.equal(sent.input.referrerPolicy, "no-referrer"); }
  });
}

test("an explicit body replacement does not touch an already consumed original Request", async t => {
  const calls = captureWire(t);
  const { loader } = await setup();
  const request = new Request(international + "/responses", { method: "POST", body: "synthetic-old" });
  await request.text();
  await loader.fetch(request, { body: "synthetic-new" });
  assert.equal(calls[0].body, "synthetic-new");
});

for (const [label, init] of [["inherited", {}], ["null body", { body: null }], ["undefined overrides", { body: undefined, keepalive: undefined }]]) {
  test("retargeted Request rejects unsupported inherited keepalive transport locally: " + label, async t => {
    const body = "synthetic-private-body";
    // Native control retains a known-length/string-backed body and accepts it.
    const control = new Request(international + "/responses", { method: "POST", body, keepalive: true });
    assert.equal(await new Request(control, {}).text(), body);
    let calls = 0; stubFetch(t, async () => { calls++; throw new Error("unsupported transport must never call upstream"); });
    const { loader } = await setup();
    const request = new Request(international + "/responses", { method: "POST", body, keepalive: true });
    request.clone = () => { throw new Error("routing must not inspect the original body"); };
    const result = await loader.fetch(request, init);
    assert.equal(result.status, 400);
    const text = await result.text();
    assert.equal(JSON.parse(text).error.code, "agentrouter_unsupported_request_transport");
    assert.match(JSON.parse(text).error.message, /keepalive/);
    assert.equal(text.includes(body), false); assert.equal(text.includes(modelKey), false);
    assert.equal(request.keepalive, true, "never silently clear the caller's transport policy");
    assert.equal(request.bodyUsed, false); assert.equal(request.body.locked, false);
    assert.equal(await request.text(), body);
    assert.equal(calls, 0);
  });
}

for (const shape of ["same URL", "bodyless", "explicit keepalive false", "explicit keepalive null", "explicit body", "explicit empty body"]) {
  test("native-compatible keepalive cases remain supported: " + shape, async t => {
    const calls = captureWire(t);
    const { loader } = await setup({ settings: { "use-domestic-api": shape === "same URL" ? false : true } });
    const sourceBody = shape === "bodyless" ? undefined : "synthetic-original";
    const request = new Request(international + "/responses", { method: shape === "bodyless" ? "GET" : "POST", body: sourceBody, keepalive: true });
    request.clone = () => { throw new Error("routing must not inspect the original body"); };
    const init = {};
    if (shape === "explicit keepalive false") init.keepalive = false;
    if (shape === "explicit keepalive null") init.keepalive = null;
    if (shape === "explicit body") init.body = "synthetic-replacement";
    if (shape === "explicit empty body") init.body = "";
    await loader.fetch(request, init);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, (shape === "same URL" ? international : domestic) + "/responses");
    assert.equal(calls[0].body, shape === "bodyless" ? "" : init.body ?? sourceBody);
    const wire = new Request(calls[0].url, { keepalive: calls[0].input.keepalive });
    assert.equal(wire.keepalive, !shape.startsWith("explicit keepalive"));
    assert.equal(request.keepalive, true);
    if (shape === "explicit body" || shape === "explicit empty body") assert.equal(await request.text(), sourceBody);
  });
}

test("existing bounded replay preparation can supply a keepalive-safe body without a routing read", async t => {
  const calls = captureWire(t);
  const { loader } = await setup({ settings: { "portable-responses": true } });
  const body = JSON.stringify({ input: [{ type: "function_call", id: "fc_keepalive", call_id: "call_keepalive", name: "lookup", arguments: "{}" }] });
  const request = new Request(international + "/responses", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } });
  let clones = 0; const clone = request.clone.bind(request); request.clone = () => { clones++; return clone(); };
  await loader.fetch(request);
  assert.equal(clones, 1, "only existing request preparation inspects the body");
  assert.equal(calls.length, 1); assert.equal(calls[0].url, domestic + "/responses");
  assert.equal(calls[0].input.keepalive, true);
  assert.equal(JSON.parse(calls[0].body).input[0].id, undefined);
  assert.equal(await request.text(), body);
});

test("Request body replay composes with routing using only the existing inspection clone", async t => {
  const calls = captureWire(t);
  const { loader } = await setup({ settings: { "portable-responses": true } });
  const body = JSON.stringify({ input: [{ type: "function_call", id: "fc_synthetic", call_id: "call_synthetic", name: "lookup", arguments: "{}" }] });
  const request = new Request(international + "/responses", { method: "POST", body, headers: { "content-type": "application/json", "content-length": String(body.length), digest: "old" } });
  let clones = 0; const clone = request.clone.bind(request); request.clone = () => { clones++; return clone(); };
  await loader.fetch(request);
  assert.equal(clones, 1);
  assert.deepEqual(JSON.parse(calls[0].body), { input: [{ type: "function_call", call_id: "call_synthetic", name: "lookup", arguments: "{}" }], store: false });
  assert.equal(calls[0].headers.has("digest"), false);
  assert.equal(calls[0].headers.has("content-length"), false);
  assert.equal(await request.text(), body, "rewritten wire bytes do not consume the original body");
});

for (const encoding of ["gzip", "application/octet-stream"]) test("encoded bodies route without inspection or text decoding: " + encoding, async t => {
  const bytes = new Uint8Array([0, 255, 23, 10, 128]);
  let calls = 0;
  stubFetch(t, async (input, init) => {
    calls++;
    const wire = new Request(input, init);
    assert.equal(wire.url, domestic + "/responses");
    assert.deepEqual(new Uint8Array(await wire.arrayBuffer()), bytes);
    return ok();
  });
  const { loader } = await setup({ settings: { "portable-responses": true } });
  const headers = encoding === "gzip" ? { "content-encoding": "gzip", "content-type": "application/json" } : { "content-type": encoding };
  const request = new Request(international + "/responses", { method: "POST", body: bytes, headers });
  request.clone = () => { throw new Error("encoded Request must not be cloned"); };
  await loader.fetch(request);
  assert.equal(calls, 1);
});

test("oversize Request preserves wire bytes with no additional routing clone", async t => {
  const calls = captureWire(t);
  const { loader } = await setup({ settings: { "portable-responses": true } });
  const body = JSON.stringify({ input: "x".repeat(4 * 1024 * 1024 + 1) });
  const request = new Request(international + "/responses", { method: "POST", body, headers: { "content-type": "application/json" } });
  let clones = 0; const clone = request.clone.bind(request); request.clone = () => { clones++; return clone(); };
  await loader.fetch(request);
  assert.equal(clones, 1);
  assert.equal(calls[0].body, body);
  assert.equal(calls[0].init.body, undefined);
});

test("a streaming body is not eagerly read or cloned for routing", async t => {
  const entered = deferred(); const release = deferred(); let source;
  const request = new Request(international + "/responses", { method: "POST", body: new ReadableStream({ start(controller) { source = controller; } }), duplex: "half" });
  request.clone = () => { throw new Error("disabled processing must not clone"); };
  stubFetch(t, async (input, init) => {
    assert.equal(request.bodyUsed, false); assert.equal(request.body.locked, false);
    entered.resolve(); await release.promise;
    assert.equal(await new Request(input, init).text(), "synthetic-stream");
    return ok();
  });
  const { loader } = await setup();
  const pending = loader.fetch(request);
  await entered.promise;
  source.enqueue(new TextEncoder().encode("synthetic-stream")); source.close(); release.resolve();
  await pending;
});

test("the endpoint is fixed before awaiting a slow Request inspection; concurrent next call sees the toggle", async t => {
  const calls = captureWire(t); const inspection = deferred(); let source;
  const { loader, options } = await setup({ settings: { "portable-responses": true } });
  const request = new Request(loader.baseURL + "/responses?call=first", { method: "POST", body: new ReadableStream({ start(controller) { source = controller; } }), duplex: "half", headers: { "content-type": "application/json" } });
  const clone = request.clone.bind(request); request.clone = () => { inspection.resolve(); return clone(); };
  const first = loader.fetch(request);
  await inspection.promise;
  options["use-domestic-api"] = false;
  await loader.fetch(loader.baseURL + "/responses?call=second", { method: "POST", body: "{}" });
  const body = JSON.stringify({ input: [{ type: "function_call", id: "fc_first", call_id: "call_first", name: "test", arguments: "{}" }] });
  source.enqueue(new TextEncoder().encode(body)); source.close();
  await first;
  assert.deepEqual(calls.map(call => call.url), [international + "/responses?call=second", domestic + "/responses?call=first"]);
  assert.equal(await request.text(), body);
});

test("in-flight network request stays on its endpoint while another call uses the new selection", async t => {
  const entered = deferred(); const release = deferred(); const urls = [];
  stubFetch(t, async (input, init) => {
    const wire = new Request(input, init); urls.push(wire.url);
    if (urls.length === 1) { entered.resolve(); await release.promise; }
    return ok();
  });
  const { loader, options } = await setup();
  const first = loader.fetch(loader.baseURL + "/responses?first", { method: "POST", body: "{}" });
  await entered.promise;
  options["use-domestic-api"] = false;
  await loader.fetch(loader.baseURL + "/responses?second", { method: "POST", body: "{}" });
  release.resolve(); await first;
  assert.deepEqual(urls, [domestic + "/responses?first", international + "/responses?second"]);
});

test("pre-aborted and in-flight AbortSignals reach the actual fetch without retries", async t => {
  const { loader } = await setup(); const entered = deferred(); let calls = 0;
  stubFetch(t, async (input, init) => {
    calls++; const wire = new Request(input, init); wire.signal.throwIfAborted();
    entered.resolve();
    return new Promise((_, reject) => wire.signal.addEventListener("abort", () => reject(wire.signal.reason), { once: true }));
  });
  const stopped = new AbortController(); stopped.abort();
  await assert.rejects(loader.fetch(international + "/responses", { method: "POST", body: "{}", signal: stopped.signal }), error => error.name === "AbortError");
  const active = new AbortController();
  const request = new Request(international + "/responses", { method: "POST", body: "{}", signal: active.signal });
  const pending = loader.fetch(request); await entered.promise; active.abort();
  await assert.rejects(pending, error => error.name === "AbortError");
  assert.equal(calls, 2);
});

test("AbortSignal replacement and explicit null preserve native Request cancellation semantics", async t => {
  const calls = captureWire(t);
  const { loader } = await setup(); const inherited = new AbortController(); const override = new AbortController();
  const first = new Request(international + "/responses", { method: "POST", body: "{}", signal: inherited.signal });
  const second = new Request(international + "/responses", { method: "POST", body: "{}", signal: inherited.signal });
  await loader.fetch(first, { signal: override.signal });
  await loader.fetch(second, { signal: null });
  inherited.abort(); assert.equal(calls[0].signal.aborted, false); assert.equal(calls[1].signal.aborted, false);
  override.abort(); assert.equal(calls[0].signal.aborted, true);
});

test("missing model credentials remain local even with malformed input URLs", async t => {
  let calls = 0; stubFetch(t, async () => { calls++; throw new Error("network must not run"); });
  const { loader } = await setup({ auth: { metadata: { accessToken: "synthetic-private", cookie: "session=synthetic-private" } } });
  const result = await loader.fetch("https://foreign.test/responses", { method: "POST", body: "synthetic-private" });
  assert.equal(result.status, 400); assert.equal((await result.json()).error.code, "agentrouter_missing_api_key");
  assert.equal(calls, 0);
});

test("read-only model catalog follows live selection and explicit overrides without duplicating models", async t => {
  const calls = [];
  stubFetch(t, async (input, init) => {
    const wire = new Request(input, init); calls.push(wire);
    return Response.json({ data: [{ id: "synthetic-model", supported_endpoint_types: ["responses"] }] });
  });
  const { p, options } = await setup(); const auth = authRecord();
  assert.deepEqual(Object.keys(await p.provider.models({}, { auth })), ["synthetic-model"]);
  options["use-domestic-api"] = false;
  assert.deepEqual(Object.keys(await p.provider.models({}, { auth })), ["synthetic-model"]);
  await p.provider.models({ apiBase: "https://catalog.test/custom" }, { auth });
  assert.deepEqual(calls.map(wire => wire.url), [domestic + "/models", international + "/models", "https://catalog.test/custom/models"]);
  assert.ok(calls.every(wire => wire.method === "GET" && wire.headers.get("authorization") === "Bearer " + modelKey));
});

test("model catalog strips origin-scoped credentials on INTL-to-CN selection while retaining public headers and model key", async t => {
  const calls = [];
  stubFetch(t, async (input, init) => {
    const wire = new Request(input, init); calls.push(wire);
    return Response.json({ data: [{ id: "synthetic-model" }] });
  });
  const auth = authRecord({ metadata: { site: "org", headers:
    "Cookie: synthetic-site-cookie\nCookie2: synthetic-site-cookie2\nProxy-Authorization: synthetic-proxy-token\nNew-Api-User: 42\nAuthorization: synthetic-management-token\nX-Account-Public: account" } });
  const provider = { headers: "Cookie: synthetic-provider-cookie\nX-Provider-Public: provider", models: { model: { headers: { "X-Model-Public": "model" } } } };
  const before = structuredClone({ auth, provider });
  const { p, options } = await setup({ settings: { "use-domestic-api": false }, auth, provider });
  assert.deepEqual(Object.keys(await p.provider.models(provider, { auth })), ["synthetic-model"]);
  options["use-domestic-api"] = true;
  assert.deepEqual(Object.keys(await p.provider.models(provider, { auth })), ["synthetic-model"]);
  assert.equal(calls.length, 2, "exactly one read per explicit catalog invocation");
  assert.deepEqual(calls.map(wire => wire.url), [international + "/models", domestic + "/models"]);
  for (const wire of calls) {
    assert.equal(wire.method, "GET");
    for (const name of ["cookie", "cookie2", "proxy-authorization", "new-api-user"]) assert.equal(wire.headers.has(name), false, name);
    for (const [name, value] of [["x-account-public", "account"], ["x-provider-public", "provider"], ["x-model-public", "model"]]) assert.equal(wire.headers.get(name), value);
    assert.equal(wire.headers.get("authorization"), "Bearer " + modelKey);
  }
  assert.deepEqual({ auth, provider }, before, "catalog scrubbing does not mutate saved header settings");
});

test("account web reads, check-in and key billing do not silently follow the inference switch", async t => {
  const calls = [];
  stubFetch(t, async (input, init) => {
    const wire = new Request(input, init); calls.push(wire);
    if (new URL(wire.url).pathname === "/api/user/self") return Response.json({ data: { quota: 1_000_000, used_quota: 500_000 } });
    if (new URL(wire.url).pathname === "/api/user/login") return Response.json({ success: true, data: { checked_in: true } });
    if (new URL(wire.url).pathname === "/v1/dashboard/billing/usage") return Response.json({ total_usage: 10 });
    throw new Error("unexpected account request");
  });
  const { p, options } = await setup();
  const auth = authRecord({ metadata: { site: "org", accessToken: "synthetic-site-token", userId: "42", username: "synthetic-user", password: "synthetic-password" } });
  for (const on of [true, false]) {
    options["use-domestic-api"] = on;
    await p.auth.usage(async () => auth, { endpoint: "https://custom.test" });
    assert.equal((await p.auth.checkin(async () => auth, { endpoint: "https://custom.test" })).outcome, "claimed");
    await p.auth.usage(async () => authRecord(), {});
  }
  assert.deepEqual(calls.map(wire => wire.url), [
    "https://agentrouter.org/api/user/self", "https://agentrouter.org/api/user/login", international + "/dashboard/billing/usage",
    "https://agentrouter.org/api/user/self", "https://agentrouter.org/api/user/login", international + "/dashboard/billing/usage",
  ]);
});
