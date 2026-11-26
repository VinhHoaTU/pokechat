import { describe, expect, test } from "bun:test";
import { BattleError, chooseFoeMove, computeDamage, computeStats, createRng, playTurn, typeMultiplier, type BattleState, type Fighter, type Move, type TypeChart } from "./engine";
import { describeEvent } from "./describe";

const chart: TypeChart = {
  electric: { water: 2, flying: 2, ground: 0, grass: 0.5, electric: 0.5 },
  water: { fire: 2, ground: 2, rock: 2, water: 0.5, grass: 0.5 },
  normal: { rock: 0.5, ghost: 0 },
};

const mv = (over: Partial<Move> = {}): Move => ({ slug: "m", name: "Test", type: "normal", power: 100, damageClass: "physical", accuracy: null, ...over });
const fighter = (over: Partial<Fighter> = {}): Fighter => ({
  id: 1, slug: "f", name: "F", types: ["normal"],
  stats: { hp: 100, attack: 100, defense: 100, spAttack: 100, spDefense: 100, speed: 100 },
  moves: [mv()], hp: 100, maxHp: 100, ...over,
});
const battle = (player: Fighter, foe: Fighter, rngState = 42): BattleState => ({ id: "b", turn: 1, status: "ongoing", rngState, player, foe });

describe("stats", () => {
  test("niveau 50 : formule attendue (Pikachu 35/55/40/50/50/90)", () => {
    const s = computeStats({ hp: 35, attack: 55, defense: 40, spAttack: 50, spDefense: 50, speed: 90 });
    expect(s).toEqual({ hp: 95, attack: 60, defense: 45, spAttack: 55, spDefense: 55, speed: 95 });
  });
});

describe("dégâts", () => {
  const a = fighter({ types: ["fire"] }); // type neutre vis-à-vis des attaques testées : pas de STAB
  const d = fighter();
  test("cas de base", () => expect(computeDamage(a, d, mv(), chart, 1).damage).toBe(46));
  test("STAB x1.5 avec une attaque de son type", () => expect(computeDamage(fighter(), d, mv(), chart, 1).damage).toBe(69)); // attaquant normal : pas de STAB
  test("avec STAB", () => expect(computeDamage(fighter({ types: ["electric"] }), d, mv({ type: "electric" }), chart, 1).damage).toBe(69));
  test("super efficace x2", () => expect(computeDamage(a, fighter({ types: ["water"] }), mv({ type: "electric" }), chart, 1).damage).toBe(92));
  test("immunité = 0", () => expect(computeDamage(a, fighter({ types: ["ground"] }), mv({ type: "electric" }), chart, 1).damage).toBe(0));
  test("double type : multiplicateurs composés", () => expect(typeMultiplier(chart, "electric", ["water", "flying"])).toBe(4));
  test("minimum 1 dégât si non immunisé", () => {
    const weak = fighter({ stats: { hp: 100, attack: 1, defense: 100, spAttack: 1, spDefense: 100, speed: 1 } });
    expect(computeDamage(weak, fighter({ stats: { hp: 100, attack: 1, defense: 999, spAttack: 1, spDefense: 999, speed: 1 } }), mv({ power: 1 }), chart, 0.85).damage).toBeGreaterThanOrEqual(1);
  });
  test("catégorie spéciale utilise Att. Spé / Déf. Spé", () => {
    const x = fighter({ stats: { hp: 100, attack: 10, defense: 100, spAttack: 200, spDefense: 100, speed: 100 } });
    expect(computeDamage(x, d, mv({ damageClass: "special" }), chart, 1).damage).toBeGreaterThan(computeDamage(x, d, mv(), chart, 1).damage);
  });
});

describe("tour de combat", () => {
  test("le plus rapide joue en premier", () => {
    const s = battle(fighter({ stats: { ...fighter().stats, speed: 50 } }), fighter({ name: "Rapide", stats: { ...fighter().stats, speed: 200 } }));
    expect(playTurn(s, 0, chart).events[0]!.actor).toBe("foe");
  });
  test("un Pokémon K.O. ne riposte pas", () => {
    const s = battle(fighter({ stats: { ...fighter().stats, speed: 200 } }), fighter({ hp: 1 }));
    const r = playTurn(s, 0, chart);
    expect(r.events).toHaveLength(1);
    expect(r.state.status).toBe("won");
    expect(r.state.foe.hp).toBe(0);
  });
  test("les dégâts ne dépassent jamais les PV restants", () => {
    const r = playTurn(battle(fighter(), fighter({ hp: 5 })), 0, chart);
    expect(r.events[0]!.damage).toBe(5);
  });
  test("défaite du joueur", () => {
    const s = battle(fighter({ hp: 1, stats: { ...fighter().stats, speed: 1 } }), fighter());
    expect(playTurn(s, 0, chart).state.status).toBe("lost");
  });
  test("déterministe : même état + même choix = même résultat", () => {
    const s = battle(fighter({ moves: [mv({ accuracy: 70 })] }), fighter({ moves: [mv({ accuracy: 70 })] }), 1234);
    expect(playTurn(s, 0, chart)).toEqual(playTurn(s, 0, chart));
  });
  test("ne modifie pas l'état d'entrée", () => {
    const s = battle(fighter(), fighter());
    const snapshot = structuredClone(s);
    playTurn(s, 0, chart);
    expect(s).toEqual(snapshot);
  });
  test("précision 0 : l'attaque rate toujours", () => {
    const s = battle(fighter({ moves: [mv({ accuracy: 0 })] }), fighter({ moves: [mv({ accuracy: 0 })] }));
    const r = playTurn(s, 0, chart);
    expect(r.events.every((e) => !e.hit && e.damage === 0)).toBe(true);
    expect(r.state.player.hp).toBe(100);
  });
  test("attaque invalide refusée", () => {
    const s = battle(fighter(), fighter());
    for (const i of [-1, 1, 99, 0.5, NaN]) expect(() => playTurn(s, i, chart)).toThrow(BattleError);
  });
  test("combat terminé : plus aucune action", () => {
    const s = { ...battle(fighter(), fighter()), status: "won" as const };
    expect(() => playTurn(s, 0, chart)).toThrow(BattleError);
  });
  test("l'adversaire choisit l'attaque au meilleur dégât espéré", () => {
    const foe = fighter({ moves: [mv({ power: 40 }), mv({ power: 120 }), mv({ power: 120, accuracy: 50 })] });
    expect(chooseFoeMove(foe, fighter(), chart)).toBe(1);
  });
  test("RNG reproductible", () => {
    const a = createRng(7), b = createRng(7);
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
  });
});

describe("journal", () => {
  const base = { actor: "player" as const, attacker: "Pikachu", target: "Onix", move: "Tonnerre", hit: true, damage: 30, effectiveness: 1, stab: true, targetHpAfter: 10, fainted: false };
  test("touche normale", () => expect(describeEvent(base)).toBe("Pikachu utilise Tonnerre : 30 dégâts."));
  test("super efficace + K.O.", () => expect(describeEvent({ ...base, effectiveness: 2, fainted: true })).toContain("super efficace"));
  test("raté", () => expect(describeEvent({ ...base, hit: false })).toContain("échoue"));
  test("immunité", () => expect(describeEvent({ ...base, effectiveness: 0, damage: 0 })).toContain("n'affecte pas"));
});
