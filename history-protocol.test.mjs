import test from "node:test";
import assert from "node:assert/strict";

// Override only for offline regression comparison with a previous installed version.
// Neither real credentials nor private conversation captures belong in this test.
const pluginUrl = process.env.MAGPIE_TEST_PLUGIN_URL ?? new URL("./index.mjs", import.meta.url).href;
const { default: plugin } = await import(pluginUrl);
const url = "https://agentrouter.org/v1/responses";
const assistant = (content, extra = {}) => ({
  type: "message", id: "msg_fixture", role: "assistant", status: "completed",
  phase: "commentary", content, ...extra,
});
const plainPart = (text = "Checking") => ({ type: "output_text", text, annotations: [], logprobs: [] });

async function capture(t, body, portableResponses = true) {
  const before = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (input, init) => {
    sent.push({ url: input instanceof Request ? input.url : String(input), init });
    return Response.json({ id: "resp_fixture", object: "response", status: "completed", output: [] });
  };
  t.after(() => { globalThis.fetch = before; });
  const hooks = await plugin({ magpie: { option: (_provider, name) => {
    if (name === "portable-responses") return portableResponses;
    if (name === "text-filter") return false;
    return undefined;
  } } });
  const loader = await hooks.auth.loader(async () => ({ type: "api", key: "offline-fixture-key" }), {});
  const original = typeof body === "string" ? body : JSON.stringify(body);
  await loader.fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: original });
  assert.equal(sent.length, 1, "the compatibility hook must not retry a POST");
  return { raw: sent[0].init.body, body: JSON.parse(sent[0].init.body), original };
}

// The output-message variant requires id/status and output_text/refusal. Once its
// resource-local id is removed, do not leave a half-output message behind. A plain
// EasyInputMessage with content:string is the unambiguous replay representation.
// Contract: openai-python easy_input_message_param.py / response_output_message_param.py.
function assertEasyAssistant(item, text, phase = "commentary") {
  assert.deepEqual(item, { role: "assistant", phase, content: text },
    "plain assistant replay must be an EasyInputMessage, not a malformed typed output message");
}

test("history grammar: completed assistant output becomes an unambiguous inline message", async t => {
  const input = { model: "fixture-model", store: true, input: [assistant([plainPart()])] };
  const sent = await capture(t, input);
  assertEasyAssistant(sent.body.input[0], "Checking");
  assert.equal(sent.body.store, false);
  assert.equal(sent.original, JSON.stringify(input), "the caller's original body stays unchanged");
});

test("history grammar: ordered Unicode text segments retain every character and phase", async t => {
  const sent = await capture(t, { input: [assistant([plainPart("你好\n"), plainPart("世界")], { phase: "final_answer" })] });
  assertEasyAssistant(sent.body.input[0], "你好\n世界", "final_answer");
});

test("history grammar: id-less assistant output is normalized instead of retaining an invalid output shape", async t => {
  const item = assistant([plainPart()]);
  delete item.id;
  const sent = await capture(t, { input: [item] });
  assertEasyAssistant(sent.body.input[0], "Checking");
});

test("history grammar: legacy assistant input_text is replayed without the relay's rejected typed shape", async t => {
  const sent = await capture(t, { input: [assistant([{ type: "input_text", text: "Legacy reply" }])] });
  assertEasyAssistant(sent.body.input[0], "Legacy reply");
});

test("history grammar: string assistant content keeps its text and phase", async t => {
  const sent = await capture(t, { input: [assistant("Text with msg_fixture inside")] });
  assertEasyAssistant(sent.body.input[0], "Text with msg_fixture inside");
});

for (const content of ["", [plainPart("")], [plainPart(" \n\t")]]) {
  test("history grammar: empty or whitespace text is never filled with invented content: " + JSON.stringify(content), async t => {
    const sent = await capture(t, { input: [assistant(content)] });
    assertEasyAssistant(sent.body.input[0], typeof content === "string" ? content : content.map(part => part.text).join(""));
  });
}

test("history grammar: unknown message fields are not dropped during replay", async t => {
  const original = JSON.stringify({ input: [assistant([plainPart()], { future_state: { id: "opaque_keep" } })] }, null, 2);
  assert.equal((await capture(t, original)).raw, original);
});

for (const [label, content] of [
  ["refusal", [{ type: "refusal", refusal: "Synthetic refusal" }]],
  ["citation", [{ ...plainPart(), annotations: [{ type: "url_citation", url: "https://example.test/source", start_index: 0, end_index: 8, title: "Source" }] }]],
  ["nonempty probabilities", [{ ...plainPart(), logprobs: [{ token: "Checking", logprob: -1, bytes: [] }] }]],
  ["unknown probability shape", [{ ...plainPart(), logprobs: null }]],
  ["unknown annotation shape", [{ ...plainPart(), annotations: null }]],
  ["mixed image content", [plainPart(), { type: "input_image", image_url: "https://example.test/image.png" }]],
  ["future part metadata", [{ ...plainPart(), future_state: "opaque" }]],
]) {
  test("history grammar: " + label + " remains byte-identical rather than being downgraded", async t => {
    const original = JSON.stringify({ store: true, input: [assistant(content)] }, null, 2);
    const sent = await capture(t, original);
    assert.equal(sent.raw, original);
  });
}

test("history grammar: tool correlations and opaque state survive an adjacent plain message", async t => {
  const call = { type: "function_call", id: "fc_fixture", call_id: "call_keep", name: "lookup", arguments: '{"id":"nested_keep"}' };
  const result = { type: "function_call_output", id: "fco_fixture", call_id: "call_keep", output: '{"id":"result_keep","value":42}' };
  const opaque = [
    { type: "reasoning", id: "rs_fixture", summary: [], encrypted_content: "synthetic-sealed-state" },
    { type: "compaction", id: "cmp_fixture", encrypted_content: "synthetic-compaction" },
    { type: "future_item", id: "future_fixture", payload: { id: "opaque_keep" } },
  ];
  const sent = await capture(t, { input: [assistant([plainPart()]), call, result, ...opaque] });
  assertEasyAssistant(sent.body.input[0], "Checking");
  const expectedCall = { ...call }; delete expectedCall.id;
  const expectedResult = { ...result }; delete expectedResult.id;
  assert.deepEqual(sent.body.input.slice(1), [expectedCall, expectedResult, ...opaque]);
});

for (const [label, state] of [
  ["previous response", { previous_response_id: "resp_fixture" }],
  ["conversation", { conversation: "conv_fixture" }],
  ["item reference", { input: [assistant([plainPart()]), { type: "item_reference", id: "msg_reference" }] }],
  ["native ID-only reference", { input: [assistant([plainPart()]), { id: "msg_reference" }] }],
]) {
  test("history grammar: " + label + " is not silently detached from server context", async t => {
    const original = JSON.stringify({ store: true, input: [assistant([plainPart()])], ...state }, null, 2);
    const sent = await capture(t, original);
    assert.equal(sent.raw, original);
  });
}

test("history grammar: disabling portable replay preserves the original request exactly", async t => {
  const original = JSON.stringify({ store: true, input: [assistant([plainPart()])] }, null, 2);
  assert.equal((await capture(t, original, false)).raw, original);
});

test("history grammar: a repeated preparation is idempotent", async t => {
  const { prepareResponsesRequest } = await import("./request.mjs");
  const first = await prepareResponsesRequest(url, { method: "POST", body: JSON.stringify({ input: [assistant([plainPart()])] }) });
  const second = await prepareResponsesRequest(url, first);
  assert.equal(second, first);
  assertEasyAssistant(JSON.parse(second.body).input[0], "Checking");
});
