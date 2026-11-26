import { ollamaChat } from "../agent/ollama";
import type { TurnEvent } from "./engine";

const SYSTEM = `Tu es le commentateur d'un combat Pokémon. En 1 à 3 phrases courtes et vivantes, en français, raconte UNIQUEMENT les événements JSON fournis.
Interdit : inventer une attaque, un effet ou un événement, citer des chiffres de dégâts ou de PV, désigner un vainqueur si aucun Pokémon n'est K.O.`;

/** Habillage narratif facultatif. En cas d'échec on renvoie null : le combat reste jouable avec le journal factuel. */
export async function narrate(events: TurnEvent[]): Promise<string | null> {
  try {
    const payload = events.map((e) => ({
      attaquant: e.attacker,
      cible: e.target,
      attaque: e.move,
      touche: e.hit,
      efficacite: e.effectiveness === 0 ? "aucun effet" : e.effectiveness > 1 ? "super efficace" : e.effectiveness < 1 ? "peu efficace" : "normale",
      cible_ko: e.fainted,
    }));
    const msg = await ollamaChat(
      [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(payload) }],
      undefined,
      20_000,
    );
    return msg.content.trim() || null;
  } catch {
    return null;
  }
}
