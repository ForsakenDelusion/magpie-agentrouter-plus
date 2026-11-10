// Inference endpoints are independent of the account's web/OAuth/check-in site.
export const DOMESTIC_API_BASE = "https://ps.air-outer.com/v1";
export const INTERNATIONAL_API_BASE = "https://agentrouter.org/v1";

function endpointError(code = "agentrouter_invalid_endpoint") {
  const error = new TypeError(code === "agentrouter_untrusted_request_url"
    ? "AgentRouter：模型请求地址不属于已选 API 端点，未发送请求或凭据。"
    : "AgentRouter：endpoint/apiBase 必须是不含用户名、密码、查询参数或片段的有效 HTTP(S) 地址。未发送请求或凭据。");
  error.code = code;
  return error;
}

// Old onboarding versions sometimes saved the model key in endpoint. A value
// without a URL scheme is not configuration; ignore it without echoing it.
// An explicitly malformed/unsafe URL is an error, not permission to silently
// spend on a different endpoint. Only the first applicable override is used.
function configuredURL(value) {
  const text = String(value ?? "").trim();
  if (!text || !/^[a-z][a-z\d+.-]*:/i.test(text)) return null;
  let url;
  try { url = new URL(text); } catch { throw endpointError(); }
  if (!/^https?:\/\//i.test(text) || !["https:", "http:"].includes(url.protocol) ||
      !url.hostname || url.username || url.password || text.includes("?") || text.includes("#") ||
      /[\s\\\u0000-\u001f\u007f]/.test(text)) {
    throw endpointError();
  }
  return url;
}

export function isApiURL(value) {
  try { return configuredURL(value) !== null; } catch { return false; }
}

function normalizedBase(url, appendVersion) {
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = appendVersion && !path.endsWith("/v1") ? path + "/v1" : path || "/";
  return url.href.replace(/\/+$/, "");
}

// Explicit advanced overrides win over the boolean switch. endpoint is a site
// root/prefix (add /v1 once); apiBase is an already complete API prefix. The
// caller supplies flat account fields, so both host metadata shapes work here.
export function resolveApiBase(account = {}, provider = {}, useDomesticApi = true) {
  for (const value of [account.endpoint, provider?.endpoint]) {
    const url = configuredURL(value);
    if (url) return normalizedBase(url, true);
  }
  for (const value of [account.apiBase, provider?.apiBase]) {
    const url = configuredURL(value);
    if (url) return normalizedBase(url, false);
  }
  return useDomesticApi !== false ? DOMESTIC_API_BASE : INTERNATIONAL_API_BASE;
}

// Snapshot a request's destination before any asynchronous body preparation.
// A cached SDK may still construct URLs under its initial base or either vendor
// front door. Only those prefixes and the current explicit base are eligible;
// an arbitrary input URL must never acquire the model key. Longest-prefix
// matching keeps custom paths intact even on the vendor's own origins.
export function routeApiURL(input, selectedBase, initialBase) {
  let url;
  try { url = new URL(input instanceof Request ? input.url : input); }
  catch { throw endpointError("agentrouter_untrusted_request_url"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw endpointError("agentrouter_untrusted_request_url");
  }
  const candidates = [selectedBase, initialBase, DOMESTIC_API_BASE, INTERNATIONAL_API_BASE]
    .filter(Boolean).map(base => new URL(base))
    .sort((left, right) => right.pathname.length - left.pathname.length);
  const source = candidates.find(base => {
    const path = base.pathname.replace(/\/+$/, "");
    return url.origin === base.origin && (url.pathname === path || url.pathname.startsWith(path + "/"));
  });
  if (!source) throw endpointError("agentrouter_untrusted_request_url");
  const sourcePath = source.pathname.replace(/\/+$/, "");
  const target = new URL(selectedBase);
  target.pathname = target.pathname.replace(/\/+$/, "") + url.pathname.slice(sourcePath.length);
  target.search = url.search;
  target.hash = url.hash;
  return target.href;
}

export class UnsupportedRequestTransportError extends TypeError {
  constructor() {
    super("AgentRouter：无法在不读取正文的情况下切换仍继承原正文且 keepalive=true 的 Request 端点。请由调用方显式提供序列化字符串 init.body，或显式选择 keepalive=false 后再发送。插件未发送请求或凭据。");
    this.name = "UnsupportedRequestTransportError";
    this.code = "agentrouter_unsupported_request_transport";
  }
}

// URL-only and string requests keep their init untouched. Retargeting a Request
// needs its inherited Fetch options too: passing only a new URL and init would
// drop the Request body, method and cancellation. Never read/clone its body here.
// Use the prepared body override when present, even if the original was used.
// null, as with fetch(Request, { body: null }), still inherits the original body.
export function requestAtURL(input, init, url) {
  if (!(input instanceof Request)) return { input: input instanceof URL ? new URL(url) : url, init };
  if (input.url === url) return { input, init };
  const body = init.body ?? input.body;
  const keepalive = init.keepalive === undefined ? input.keepalive : Boolean(init.keepalive);
  // Public Request exposes the inherited body only as a stream, not its
  // original string/byte source or known length. Rebuilding it under a new URL
  // would make native keepalive reject that stream. Do not buffer it or clear
  // keepalive silently; prepared/explicit body replacements keep their source.
  if (init.body == null && body !== null && keepalive) throw new UnsupportedRequestTransportError();
  const inherited = {
    method: input.method,
    headers: input.headers,
    signal: input.signal,
    credentials: input.credentials,
    mode: input.mode,
    cache: input.cache,
    redirect: input.redirect,
    referrer: input.referrer,
    referrerPolicy: input.referrerPolicy,
    integrity: input.integrity,
    keepalive: input.keepalive,
    ...(input.duplex ? { duplex: input.duplex } : {}),
  };
  // Undefined dictionary entries inherit, as native fetch(Request, init) does.
  const overrides = Object.fromEntries(Object.entries(init).filter(([, value]) => value !== undefined));
  const request = new Request(url, { ...inherited, ...overrides, body });
  return { input: request, init };
}
