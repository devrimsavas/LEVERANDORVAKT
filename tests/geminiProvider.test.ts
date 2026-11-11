import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { lukas, registerAndLogin } from "./helpers/users.js";
import { brregEnhet, useFakeBrreg } from "./helpers/fakeBrreg.js";

// The Gemini provider is tested through the assistant endpoint, against a
// fake Gemini API that checks the request format and returns queued replies.

const brreg = useFakeBrreg();

const ALTA_TOURS = "912345678";
const ARCTIC_FISH = "923456789";

interface GeminiRequest {
  url: URL;
  apiKey: string | null;
  body: {
    systemInstruction?: { parts: { text: string }[] };
    contents: { role: string; parts: Record<string, unknown>[] }[];
    tools: { functionDeclarations: { name: string }[] }[];
  };
}

const requests: GeminiRequest[] = [];
const replies: Response[] = [];

function replyWith(parts: Record<string, unknown>[]) {
  replies.push(
    Response.json({ candidates: [{ content: { role: "model", parts } }] }),
  );
}

beforeEach(() => {
  requests.length = 0;
  replies.length = 0;
  vi.stubEnv("AI_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("GEMINI_MODEL", "gemini-test-flash");

  brreg.extraHandlers.push((url, init) => {
    if (url.hostname !== "generativelanguage.googleapis.com") {
      return null;
    }
    requests.push({
      url,
      apiKey: new Headers(init?.headers).get("x-goog-api-key"),
      body: JSON.parse(String(init?.body)) as GeminiRequest["body"],
    });
    return (
      replies.shift() ??
      Response.json({ error: { message: "No reply queued" } }, { status: 500 })
    );
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function ask(message: string) {
  const { auth } = await registerAndLogin(lukas);
  return {
    auth,
    res: await request(app)
      .post("/api/assistant/messages")
      .set(auth)
      .send({ message }),
  };
}

describe("Gemini provider", () => {
  it("sends the instructions, the question and the tools in Gemini's format", async () => {
    replyWith([{ text: "Hello " }, { text: "there." }]);

    const { res } = await ask("Hi");

    expect(res.body.answer).toBe("Hello there.");
    const [sent] = requests;
    expect(sent!.url.pathname).toBe(
      "/v1beta/models/gemini-test-flash:generateContent",
    );
    expect(sent!.apiKey).toBe("test-key");
    expect(sent!.body.systemInstruction!.parts[0]!.text).toContain(
      "Leverandørvakt",
    );
    expect(sent!.body.contents).toEqual([
      { role: "user", parts: [{ text: "Hi" }] },
    ]);
    expect(sent!.body.tools[0]!.functionDeclarations).toHaveLength(8);
  });

  it("sends Gemini's tool call back unchanged, with its signature, followed by the result", async () => {
    const { auth } = await registerAndLogin(lukas);
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    await request(app)
      .post("/api/watchlist")
      .set(auth)
      .send({ orgNumber: ALTA_TOURS })
      .expect(201);
    const modelTurn = {
      functionCall: { id: "call-1", name: "list_watchlist", args: {} },
      thoughtSignature: "signature-A",
    };
    replyWith([modelTurn]);
    replyWith([{ text: "You follow ALTA TOURS AS." }]);

    const res = await request(app)
      .post("/api/assistant/messages")
      .set(auth)
      .send({ message: "What do I follow?" });

    expect(res.body).toMatchObject({
      answer: "You follow ALTA TOURS AS.",
      toolsUsed: ["list_watchlist"],
    });
    const [, model, result] = requests[1]!.body.contents;
    expect(model).toEqual({ role: "model", parts: [modelTurn] });
    expect(result).toMatchObject({
      role: "user",
      parts: [
        {
          functionResponse: {
            id: "call-1",
            name: "list_watchlist",
            response: {
              result: [expect.objectContaining({ name: "ALTA TOURS AS" })],
            },
          },
        },
      ],
    });
  });

  it("puts the results of parallel tool calls into one turn, in order", async () => {
    brreg.setActive(brregEnhet(ALTA_TOURS, "ALTA TOURS AS"));
    brreg.setActive(brregEnhet(ARCTIC_FISH, "ARCTIC FISH AS"));
    replyWith([
      {
        functionCall: {
          id: "a",
          name: "get_company",
          args: { orgNumber: ALTA_TOURS },
        },
        thoughtSignature: "signature-B",
      },
      {
        functionCall: {
          id: "b",
          name: "get_company",
          args: { orgNumber: ARCTIC_FISH },
        },
      },
    ]);
    replyWith([{ text: "Both are active." }]);

    await ask("Compare Alta Tours and Arctic Fish");

    const contents = requests[1]!.body.contents;
    expect(contents).toHaveLength(3);
    expect(
      contents[2]!.parts.map((p) => (p.functionResponse as { id: string }).id),
    ).toEqual(["a", "b"]);
  });

  it("returns 502 when Gemini refuses the request, e.g. because the free quota is used up", async () => {
    replies.push(
      Response.json(
        { error: { message: "Resource has been exhausted" } },
        { status: 429 },
      ),
    );

    const { res } = await ask("Hi");

    expect(res.status).toBe(502);
  });
});
