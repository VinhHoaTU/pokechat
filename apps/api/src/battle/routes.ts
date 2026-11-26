import { Hono, type Context } from "hono";
import { z } from "zod";
import { BattleError, playTurn, type BattleState, type Fighter } from "./engine";
import { describeEvent } from "./describe";
import { narrate } from "./narrator";
import { loadFighter, matchMove } from "./setup";
import { getBattle, saveBattle, withLock } from "./store";
import { getTypeChart } from "./typeChart";
import { typeFr } from "../pokeapi/types";

const fighterView = (f: Fighter) => ({ id: f.id, name: f.name, types: f.types.map(typeFr), hp: f.hp, maxHp: f.maxHp });

/** Ce que voit le client : jamais l'état du RNG ni les attaques de l'adversaire. */
function toView(s: BattleState) {
  return {
    id: s.id,
    turn: s.turn,
    status: s.status,
    player: {
      ...fighterView(s.player),
      moves: s.player.moves.map((m, index) => ({
        index, name: m.name, type: typeFr(m.type), power: m.power, accuracy: m.accuracy,
        category: m.damageClass === "physical" ? "physique" : "spéciale",
      })),
    },
    foe: fighterView(s.foe),
  };
}

export const battleRoutes = new Hono();

const Start = z.object({ player: z.string().min(1).max(60), foe: z.string().min(1).max(60) });
const MoveBody = z.object({ moveIndex: z.number().int().min(0).max(3) });
const SayBody = z.object({ text: z.string().min(1).max(200) });

battleRoutes.post("/", async (c) => {
  const body = Start.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Requête invalide." }, 400);
  const [chart, player, foe] = await Promise.all([getTypeChart(), loadFighter(body.data.player), loadFighter(body.data.foe)]);
  void chart;
  for (const r of [player, foe]) {
    if (!r.ok) return c.json({ error: r.error, suggestions: r.suggestions }, 404);
  }
  if (!player.ok || !foe.ok) return c.json({ error: "Pokémon introuvable." }, 404);
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  const state: BattleState = { id: crypto.randomUUID(), turn: 1, status: "ongoing", rngState: seed, player: player.fighter, foe: foe.fighter };
  saveBattle(state);
  return c.json({ battle: toView(state) });
});

battleRoutes.get("/:id", (c) => {
  const s = getBattle(c.req.param("id"));
  return s ? c.json({ battle: toView(s) }) : c.json({ error: "Combat introuvable." }, 404);
});

async function play(c: Context, id: string, moveIndex: number, extra: object = {}) {
  const outcome = await withLock(id, async () => {
    const state = getBattle(id);
    if (!state) return c.json({ error: "Combat introuvable." }, 404);
    let result;
    try {
      result = playTurn(state, moveIndex, await getTypeChart());
    } catch (e) {
      if (e instanceof BattleError) return c.json({ error: e.message }, 400);
      throw e;
    }
    saveBattle(result.state);
    const narration = await narrate(result.events);
    return c.json({ battle: toView(result.state), events: result.events, lines: result.events.map(describeEvent), narration, ...extra });
  });
  return outcome === "busy" ? c.json({ error: "Un tour est déjà en cours." }, 409) : outcome;
}

battleRoutes.post("/:id/move", async (c) => {
  const body = MoveBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Requête invalide." }, 400);
  return play(c, c.req.param("id"), body.data.moveIndex);
});

/** Texte libre : le code (pas le LLM) associe le message à une attaque légale, ou demande de préciser. */
battleRoutes.post("/:id/say", async (c) => {
  const body = SayBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Requête invalide." }, 400);
  const id = c.req.param("id");
  const state = getBattle(id);
  if (!state) return c.json({ error: "Combat introuvable." }, 404);
  const idx = matchMove(body.data.text, state.player.moves);
  if (idx < 0) {
    const list = state.player.moves.map((m, i) => `${i + 1}. ${m.name}`).join(", ");
    return c.json({ battle: toView(state), understood: false, message: `Je n'ai pas compris quelle attaque jouer. Choisis parmi : ${list}.` });
  }
  return play(c, id, idx, { understood: true });
});
