/**
 * Moteur de combat : fonctions pures, déterministes (RNG à graine), sans aucun
 * accès réseau ni LLM. C'est lui qui décide de tout ; le LLM ne fait que raconter.
 */

export type StatKey = "hp" | "attack" | "defense" | "spAttack" | "spDefense" | "speed";
export type Stats = Record<StatKey, number>;
export type TypeChart = Record<string, Record<string, number>>; // type attaquant -> type défenseur -> multiplicateur

export const LEVEL = 50;

export interface Move {
  slug: string;
  name: string; // nom affiché (français si disponible)
  type: string; // slug anglais
  power: number;
  damageClass: "physical" | "special";
  accuracy: number | null; // null = ne rate jamais
}

export interface Fighter {
  id: number;
  slug: string;
  name: string;
  types: string[];
  stats: Stats; // stats calculées au niveau LEVEL
  moves: Move[];
  hp: number;
  maxHp: number;
}

export interface BattleState {
  id: string;
  turn: number;
  status: "ongoing" | "won" | "lost";
  rngState: number; // jamais envoyé au client
  player: Fighter;
  foe: Fighter;
}

export interface TurnEvent {
  actor: "player" | "foe";
  attacker: string;
  target: string;
  move: string;
  hit: boolean;
  damage: number;
  effectiveness: number;
  stab: boolean;
  targetHpAfter: number;
  fainted: boolean;
}

export class BattleError extends Error {}

export function computeStats(base: Stats, level = LEVEL): Stats {
  const other = (b: number) => Math.floor((2 * b * level) / 100) + 5;
  return {
    hp: Math.floor((2 * base.hp * level) / 100) + level + 10,
    attack: other(base.attack),
    defense: other(base.defense),
    spAttack: other(base.spAttack),
    spDefense: other(base.spDefense),
    speed: other(base.speed),
  };
}

export function typeMultiplier(chart: TypeChart, moveType: string, defenderTypes: string[]): number {
  return defenderTypes.reduce((m, t) => m * (chart[moveType]?.[t] ?? 1), 1);
}

export function computeDamage(attacker: Fighter, defender: Fighter, move: Move, chart: TypeChart, roll: number) {
  const effectiveness = typeMultiplier(chart, move.type, defender.types);
  const stab = attacker.types.includes(move.type);
  if (effectiveness === 0) return { damage: 0, effectiveness, stab };
  const atk = move.damageClass === "physical" ? attacker.stats.attack : attacker.stats.spAttack;
  const def = move.damageClass === "physical" ? defender.stats.defense : defender.stats.spDefense;
  const base = Math.floor(((((2 * LEVEL) / 5 + 2) * move.power * atk) / def) / 50) + 2;
  const damage = Math.max(1, Math.floor(base * (stab ? 1.5 : 1) * effectiveness * roll));
  return { damage, effectiveness, stab };
}

/** mulberry32 : petit RNG reproductible dont l'état tient dans un entier. */
export function createRng(state: number) {
  let a = state >>> 0;
  return {
    next(): number {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    get state() {
      return a;
    },
  };
}

/** L'adversaire joue l'attaque au meilleur dégât espéré (déterministe, égalité -> première). */
export function chooseFoeMove(foe: Fighter, player: Fighter, chart: TypeChart): number {
  let best = 0;
  let bestScore = -1;
  foe.moves.forEach((m, i) => {
    const { damage } = computeDamage(foe, player, m, chart, 0.925);
    const score = damage * ((m.accuracy ?? 100) / 100);
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

/** Joue un tour complet. Ne modifie pas l'état reçu : renvoie un nouvel état + les événements. */
export function playTurn(state: BattleState, playerMoveIndex: number, chart: TypeChart) {
  if (state.status !== "ongoing") throw new BattleError("Le combat est terminé.");
  if (!Number.isInteger(playerMoveIndex) || playerMoveIndex < 0 || playerMoveIndex >= state.player.moves.length) {
    throw new BattleError("Attaque invalide.");
  }
  const s = structuredClone(state);
  const rng = createRng(s.rngState);
  const foeIndex = chooseFoeMove(s.foe, s.player, chart);
  const order: ("player" | "foe")[] = s.player.stats.speed >= s.foe.stats.speed ? ["player", "foe"] : ["foe", "player"];
  const events: TurnEvent[] = [];

  for (const actor of order) {
    const attacker = actor === "player" ? s.player : s.foe;
    const defender = actor === "player" ? s.foe : s.player;
    const move = attacker.moves[actor === "player" ? playerMoveIndex : foeIndex]!;
    const hit = move.accuracy === null || rng.next() * 100 < move.accuracy;
    let damage = 0;
    let effectiveness = 1;
    let stab = false;
    if (hit) {
      const r = computeDamage(attacker, defender, move, chart, 0.85 + rng.next() * 0.15);
      damage = Math.min(r.damage, defender.hp);
      effectiveness = r.effectiveness;
      stab = r.stab;
      defender.hp -= damage;
    }
    events.push({
      actor, attacker: attacker.name, target: defender.name, move: move.name, hit, damage,
      effectiveness, stab, targetHpAfter: defender.hp, fainted: defender.hp === 0,
    });
    if (defender.hp === 0) break; // un Pokémon K.O. ne joue pas son tour
  }

  s.turn += 1;
  s.rngState = rng.state;
  if (s.foe.hp === 0) s.status = "won";
  else if (s.player.hp === 0) s.status = "lost";
  return { state: s, events };
}
