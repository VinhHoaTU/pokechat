import { describe, expect, test } from "bun:test";
import type { Move } from "./engine";
import { matchMove } from "./setup";

const m = (name: string, slug: string): Move => ({ slug, name, type: "normal", power: 50, damageClass: "physical", accuracy: 100 });
const moves = [m("Tonnerre", "thunder"), m("Vive-Attaque", "quick-attack"), m("Éclair", "thunder-shock")];

describe("matchMove (texte libre -> attaque légale)", () => {
  test("numéro", () => expect(matchMove("2", moves)).toBe(1));
  test("numéro hors liste", () => expect(matchMove("4", moves)).toBe(-1));
  test("nom français, accents ignorés", () => expect(matchMove("j'utilise eclair !", moves)).toBe(2));
  test("nom anglais", () => expect(matchMove("quick-attack", moves)).toBe(1));
  test("le nom le plus long l'emporte", () => expect(matchMove("thunder-shock", moves)).toBe(2));
  test("texte sans attaque", () => expect(matchMove("tu as perdu, j'ai gagné", moves)).toBe(-1));
});
