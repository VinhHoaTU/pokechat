import { Hono } from "hono";
import { z } from "zod";
import { runAgent } from "./agent/loop";
import { checkOllama, OllamaError } from "./agent/ollama";
import { battleRoutes } from "./battle/routes";
import { config } from "./config";
import { PokeApiError } from "./pokeapi/client";
import { warmFrenchNames } from "./pokeapi/resolve";

const app = new Hono();

app.onError((err, c) => {
  if (err instanceof OllamaError) return c.json({ error: err.message }, 503);
  if (err instanceof PokeApiError) {
    return err.kind === "not_found"
      ? c.json({ error: err.message }, 404)
      : c.json({ error: "PokéAPI est indisponible pour le moment. Réessaie dans un instant." }, 502);
  }
  console.error(err);
  return c.json({ error: "Erreur interne." }, 500);
});

app.get("/api/health", async (c) => c.json({ model: config.model, ...(await checkOllama()) }));

// Le client ne peut envoyer que des messages "user"/"assistant" : impossible d'injecter un faux message
// "system" ou "tool" pour contourner les règles de l'agent.
const ChatBody = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) })).min(1).max(40),
});

app.post("/api/chat", async (c) => {
  const body = ChatBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success || body.data.messages.at(-1)!.role !== "user") return c.json({ error: "Requête invalide." }, 400);
  return c.json(await runAgent(body.data.messages.slice(-12)));
});

app.route("/api/battle", battleRoutes);

void warmFrenchNames();
console.log(`API sur http://localhost:${config.port} — modèle : ${config.model}`);

export default { port: config.port, fetch: app.fetch };
