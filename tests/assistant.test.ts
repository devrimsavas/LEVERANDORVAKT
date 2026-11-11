import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { MAX_STEPS } from "../src/services/assistantService.js";
import { AssistantMessage } from "../src/models/AssistantMessage.js";
import { AssistantUsage } from "../src/models/AssistantUsage.js";
import { kari, lukas, registerAndLogin } from "./helpers/users.js";
import { brregEnhet, useFakeBrreg } from "./helpers/fakeBrreg.js";
import { useFakeOllama } from "./helpers/fakeLlm.js";

const brreg = useFakeBrreg();
const ollama = useFakeOllama(brreg);

const ALTA_TOURS = "912345678";
const ARCTIC_FISH = "923456789";

type Auth = Record<string, string>;

function ask(auth: Auth, message: string, conversationId?: string) {
  return request(app)
    .post("/api/assistant/messages")
    .set(auth)
    .send({ message, ...(conversationId ? { conversationId } : {}) });
}

async function follow(
  auth: Auth,
  orgNumber: string,
  name: string,
  note?: string,
) {
  brreg.setActive(brregEnhet(orgNumber, name));
  await request(app)
    .post("/api/watchlist")
    .set(auth)
    .send({ orgNumber, ...(note ? { note } : {}) })
    .expect(201);
}

describe("POST /api/assistant/messages", () => {
  it("answers a question that needs no tools", async () => {
    const { auth } = await registerAndLogin(lukas);
    ollama.reply("Hello! Ask me about the companies you follow.");

    const res = await ask(auth, "Hi");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      answer: "Hello! Ask me about the companies you follow.",
      toolsUsed: [],
    });
    expect(res.body.conversationId).toMatch(/^[0-9a-f-]{36}$/);

    // The model got the instructions, the question and every tool
    const [sent] = ollama.requests;
    expect(sent!.model).toBe("test-model");
    expect(sent!.messages[0]).toMatchObject({ role: "system" });
    expect(sent!.messages[0]!.content).toContain(
      `Today is ${new Date().toISOString().slice(0, 10)}`,
    );
    expect(sent!.messages.at(-1)).toEqual({ role: "user", content: "Hi" });
    expect(sent!.tools.map((t) => t.function.name)).toEqual([
      "list_watchlist",
      "search_companies",
      "get_company",
      "get_company_risk",
      "get_company_changes",
      "get_company_accounts",
      "get_company_roles",
      "get_notifications",
    ]);
  });

  it("runs the tools the model asks for and answers from their results", async () => {
    const { auth } = await registerAndLogin(lukas);
    await follow(
      auth,
      ALTA_TOURS,
      "ALTA TOURS AS",
      "Pays late, call Ingrid first",
    );
    ollama.callTools({ name: "list_watchlist" });
    ollama.reply("You follow ALTA TOURS AS. Its risk is low.");

    const res = await ask(auth, "Which companies do I follow?");

    expect(res.body).toMatchObject({
      answer: "You follow ALTA TOURS AS. Its risk is low.",
      toolsUsed: ["list_watchlist"],
    });
    expect(ollama.requests).toHaveLength(2);
    // The second request carries the model's tool call and the result
    const second = ollama.requests[1]!;
    expect(second.messages.at(-2)).toMatchObject({
      role: "assistant",
      tool_calls: [{ function: { name: "list_watchlist" } }],
    });
    expect(second.messages.at(-1)).toMatchObject({
      role: "tool",
      tool_name: "list_watchlist",
    });
    expect(ollama.toolResults()).toEqual([
      [
        expect.objectContaining({
          orgNumber: ALTA_TOURS,
          name: "ALTA TOURS AS",
          riskLevel: "low",
        }),
      ],
    ]);
  });

  it("never sends the user's private notes to the model", async () => {
    const { auth } = await registerAndLogin(lukas);
    await follow(
      auth,
      ALTA_TOURS,
      "ALTA TOURS AS",
      "Pays late, call Ingrid first",
    );
    ollama.callTools({ name: "list_watchlist" });
    ollama.reply("Done");

    await ask(auth, "Which companies do I follow?");

    expect(JSON.stringify(ollama.requests)).not.toContain("Pays late");
  });

  it("gives the tools only the data of the user who asks", async () => {
    const { auth: kariAuth } = await registerAndLogin(kari);
    await follow(kariAuth, ARCTIC_FISH, "ARCTIC FISH AS");
    const { auth } = await registerAndLogin(lukas);
    await follow(auth, ALTA_TOURS, "ALTA TOURS AS");
    ollama.callTools({ name: "list_watchlist" });
    ollama.reply("Done");

    await ask(auth, "Which companies do I follow?");

    const [watchlist] = ollama.toolResults() as { name: string }[][];
    expect(watchlist!.map((c) => c.name)).toEqual(["ALTA TOURS AS"]);
  });

  it("returns invalid tool input to the model as an error, so it can correct itself", async () => {
    const { auth } = await registerAndLogin(lukas);
    brreg.setActive(brregEnhet(ARCTIC_FISH, "ARCTIC FISH AS"));
    ollama.callTools({
      name: "get_company_risk",
      arguments: { orgNumber: "123" },
    });
    // Models often write organization numbers with spaces
    ollama.callTools({
      name: "get_company_risk",
      arguments: { orgNumber: "923 456 789" },
    });
    ollama.reply("ARCTIC FISH AS has a low risk.");

    const res = await ask(auth, "Is Arctic Fish risky?");

    expect(res.body.answer).toBe("ARCTIC FISH AS has a low risk.");
    expect(ollama.toolResults(1)).toEqual([
      { error: "orgNumber must be a 9-digit organization number" },
    ]);
    expect(ollama.toolResults(2)[1]).toMatchObject({
      name: "ARCTIC FISH AS",
      level: "low",
    });
  });

  it("tells the model about a tool that does not exist", async () => {
    const { auth } = await registerAndLogin(lukas);
    ollama.callTools({
      name: "delete_company",
      arguments: { orgNumber: ALTA_TOURS },
    });
    ollama.reply("I cannot do that.");

    await ask(auth, "Delete Alta Tours");

    expect(ollama.toolResults()).toEqual([
      { error: "Unknown tool: delete_company" },
    ]);
  });

  it("assesses an unfollowed company live, but has no change history for it", async () => {
    const { auth } = await registerAndLogin(lukas);
    brreg.setActive(brregEnhet(ARCTIC_FISH, "ARCTIC FISH AS"));
    ollama.callTools(
      { name: "get_company_risk", arguments: { orgNumber: ARCTIC_FISH } },
      { name: "get_company_changes", arguments: { orgNumber: ARCTIC_FISH } },
    );
    ollama.reply("Done");

    const res = await ask(auth, "Tell me about Arctic Fish");

    const [risk, changes] = ollama.toolResults() as [
      { limitations: string[] },
      { error: string },
    ];
    expect(risk.limitations.join(" ")).toContain("not followed");
    expect(changes.error).toContain(
      "only recorded for companies the user follows",
    );
    expect(res.body.toolsUsed).toEqual([
      "get_company_risk",
      "get_company_changes",
    ]);
  });

  it("tells the model when Brreg cannot be reached, and still answers", async () => {
    const { auth } = await registerAndLogin(lukas);
    brreg.setError(ALTA_TOURS, 503);
    ollama.callTools({
      name: "get_company",
      arguments: { orgNumber: ALTA_TOURS },
    });
    ollama.reply("The register is not available right now.");

    const res = await ask(auth, "Look up 912345678");

    expect(res.status).toBe(200);
    expect(ollama.toolResults()).toEqual([
      { error: "The data could not be loaded right now. Try again later." },
    ]);
  });

  it(`stops after ${MAX_STEPS} model calls when the model never answers`, async () => {
    const { auth } = await registerAndLogin(lukas);
    for (let i = 0; i < MAX_STEPS + 1; i++) {
      ollama.callTools({ name: "list_watchlist" });
    }

    const res = await ask(auth, "Loop forever");

    expect(res.status).toBe(200);
    expect(res.body.answer).toBe(
      "I could not complete the answer. Please try a more specific question.",
    );
    expect(ollama.requests).toHaveLength(MAX_STEPS);
  });

  it("continues a conversation with its earlier questions and answers", async () => {
    const { auth } = await registerAndLogin(lukas);
    ollama.reply("Alta Tours is a travel agency.");
    const first = await ask(auth, "What is Alta Tours?");
    ollama.reply("It is in Alta.");

    const second = await ask(auth, "Where is it?", first.body.conversationId);

    expect(second.body.conversationId).toBe(first.body.conversationId);
    expect(ollama.requests[1]!.messages.slice(1)).toEqual([
      { role: "user", content: "What is Alta Tours?" },
      { role: "assistant", content: "Alta Tours is a travel agency." },
      { role: "user", content: "Where is it?" },
    ]);
  });
});

describe("limits and errors", () => {
  it("allows a limited number of questions per 24 hours, also after deleting conversations", async () => {
    vi.stubEnv("ASSISTANT_DAILY_LIMIT", "2");
    const { auth } = await registerAndLogin(lukas);
    ollama.reply("One");
    ollama.reply("Two");
    const first = await ask(auth, "Question 1");
    await ask(auth, "Question 2");
    await request(app)
      .delete(`/api/assistant/conversations/${first.body.conversationId}`)
      .set(auth)
      .expect(204);

    const res = await ask(auth, "Question 3");

    expect(res.status).toBe(429);
    expect(ollama.requests).toHaveLength(2);
  });

  it("counts the limit per user", async () => {
    vi.stubEnv("ASSISTANT_DAILY_LIMIT", "1");
    const { auth: kariAuth } = await registerAndLogin(kari);
    const { auth } = await registerAndLogin(lukas);
    ollama.reply("For Kari");
    ollama.reply("For Lukas");
    await ask(kariAuth, "Question").expect(200);

    const res = await ask(auth, "Question");

    expect(res.status).toBe(200);
  });

  it.each([
    [
      "the assistant is not configured",
      () => vi.stubEnv("AI_PROVIDER", ""),
      503,
    ],
    ["Ollama is not running", () => ollama.goDown(), 503],
    [
      "the model does not exist",
      () => ollama.failWith(404, "model not found"),
      502,
    ],
    ["the model does not answer in time", () => ollama.hang(), 504],
  ])(
    "returns an error when %s, and stores nothing",
    async (_case, arrange, status) => {
      const { auth } = await registerAndLogin(lukas);
      arrange();

      const res = await ask(auth, "Hello");

      expect(res.status).toBe(status);
      expect(await AssistantMessage.count()).toBe(0);
      expect(await AssistantUsage.count()).toBe(0);
    },
  );

  it.each([
    ["no message", {}],
    ["an empty message", { message: "   " }],
    ["a message that is too long", { message: "x".repeat(1001) }],
    [
      "a conversation id that is not a UUID",
      { message: "Hi", conversationId: "42" },
    ],
  ])("returns 400 for %s", async (_case, body) => {
    const { auth } = await registerAndLogin(lukas);

    const res = await request(app)
      .post("/api/assistant/messages")
      .set(auth)
      .send(body);

    expect(res.status).toBe(400);
  });

  it("returns 401 without a token", async () => {
    const res = await request(app)
      .post("/api/assistant/messages")
      .send({ message: "Hi" });

    expect(res.status).toBe(401);
  });
});

describe("conversations", () => {
  it("lists the user's conversations, most recently used first, and shows their messages", async () => {
    const { auth } = await registerAndLogin(lukas);
    ollama.reply("Answer A");
    ollama.reply("Answer B");
    ollama.reply("Answer A2");
    const a = await ask(auth, "Question A");
    const b = await ask(auth, "Question B");
    await ask(auth, "Question A2", a.body.conversationId);

    const list = await request(app)
      .get("/api/assistant/conversations")
      .set(auth);
    const detail = await request(app)
      .get(`/api/assistant/conversations/${a.body.conversationId}`)
      .set(auth);

    expect(list.body.items.map((c: { id: string }) => c.id)).toEqual([
      a.body.conversationId,
      b.body.conversationId,
    ]);
    expect(list.body.items[0].title).toBe("Question A");
    expect(
      detail.body.messages.map((m: { role: string; content: string }) => [
        m.role,
        m.content,
      ]),
    ).toEqual([
      ["user", "Question A"],
      ["assistant", "Answer A"],
      ["user", "Question A2"],
      ["assistant", "Answer A2"],
    ]);
  });

  it("keeps each user's conversations private", async () => {
    const { auth: kariAuth } = await registerAndLogin(kari);
    const { auth } = await registerAndLogin(lukas);
    ollama.reply("Kari's answer");
    const karis = await ask(kariAuth, "Kari's question");
    const id = karis.body.conversationId as string;

    const continued = await ask(auth, "Continue Kari's conversation", id);
    const read = await request(app)
      .get(`/api/assistant/conversations/${id}`)
      .set(auth);
    const deleted = await request(app)
      .delete(`/api/assistant/conversations/${id}`)
      .set(auth);
    const list = await request(app)
      .get("/api/assistant/conversations")
      .set(auth);

    expect([continued.status, read.status, deleted.status]).toEqual([
      404, 404, 404,
    ]);
    expect(list.body.items).toEqual([]);
    expect(ollama.requests).toHaveLength(1);
  });

  it("deletes a conversation and its messages", async () => {
    const { auth } = await registerAndLogin(lukas);
    ollama.reply("Answer");
    const { body } = await ask(auth, "Question");

    await request(app)
      .delete(`/api/assistant/conversations/${body.conversationId}`)
      .set(auth)
      .expect(204);

    await request(app)
      .get(`/api/assistant/conversations/${body.conversationId}`)
      .set(auth)
      .expect(404);
    expect(await AssistantMessage.count()).toBe(0);
  });
});
