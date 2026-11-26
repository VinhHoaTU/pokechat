import { ollamaChat, type ChatMessage } from "./ollama";
import { executeTool, toolSchemas } from "./tools";

const SYSTEM = `Tu es un assistant spécialisé dans les Pokémon. Tu réponds toujours en français, de façon concise.
Règles strictes :
- Pour tout fait sur un Pokémon, une attaque, un type ou une évolution, appelle d'abord l'outil adapté. Ne réponds jamais de mémoire.
- Appuie ta réponse uniquement sur les résultats des outils. N'invente aucun chiffre ni aucune information.
- Si un outil renvoie une erreur ou ne trouve rien, dis-le clairement et propose les suggestions fournies. Ne devine pas.
- Pour get_move, donne le nom ANGLAIS de l'attaque.
- Si la question n'a aucun rapport avec les Pokémon, explique poliment que tu ne réponds qu'aux questions sur les Pokémon.`;

const MAX_STEPS = 5;

export interface AgentResult {
  reply: string;
  toolsUsed: string[];
}

export async function runAgent(history: { role: "user" | "assistant"; content: string }[]): Promise<AgentResult> {
  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM }, ...history];
  const toolsUsed: string[] = [];
  let nudged = false;

  for (let step = 0; step < MAX_STEPS; step++) {
    const msg = await ollamaChat(messages, toolSchemas);
    const calls = msg.tool_calls ?? [];

    if (calls.length === 0) {
      // Filet de sécurité : le modèle répond sans avoir consulté de données. On le relance une fois.
      if (toolsUsed.length === 0 && !nudged) {
        nudged = true;
        messages.push(
          { role: "assistant", content: msg.content },
          { role: "user", content: "Rappel : si ma question porte sur un fait Pokémon, appelle d'abord un outil. Sinon, dis que tu ne réponds qu'aux questions sur les Pokémon." },
        );
        continue;
      }
      return { reply: msg.content.trim() || "Je n'ai pas de réponse fiable à te donner.", toolsUsed };
    }

    messages.push(msg);
    for (const call of calls) {
      toolsUsed.push(call.function.name);
      const result = await executeTool(call.function.name, call.function.arguments);
      messages.push({ role: "tool", tool_name: call.function.name, content: JSON.stringify(result) });
    }
  }
  return { reply: "Je n'ai pas réussi à répondre de façon fiable (trop d'appels d'outils). Reformule ta question.", toolsUsed };
}
