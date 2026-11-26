import { describe, expect, test } from "bun:test";
import { levenshtein, mapLimit, normalize } from "./util";
import { resolveType } from "./pokeapi/types";

describe("normalize", () => {
  test("accents et casse", () => expect(normalize("Salamèche")).toBe("salameche"));
  test("ponctuation", () => {
    expect(normalize("Mr. Mime")).toBe(normalize("mr-mime"));
    expect(normalize("Farfetch'd")).toBe(normalize("farfetchd"));
  });
});
test("levenshtein", () => {
  expect(levenshtein("pikachu", "pikatchu")).toBe(1);
  expect(levenshtein("abc", "abc")).toBe(0);
});
test("mapLimit respecte la limite et l'ordre", async () => {
  let running = 0, peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (x) => {
    peak = Math.max(peak, ++running);
    await Bun.sleep(5);
    running--;
    return x * 2;
  });
  expect(out).toEqual([2, 4, 6, 8, 10, 12]);
  expect(peak).toBeLessThanOrEqual(2);
});
test("resolveType FR/EN", () => {
  expect(resolveType("Électrik")).toBe("electric");
  expect(resolveType("FEU")).toBe("fire");
  expect(resolveType("inconnu")).toBeNull();
});
