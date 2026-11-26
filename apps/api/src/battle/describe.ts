import type { TurnEvent } from "./engine";

/** Ligne de journal factuelle, générée par le code (jamais par le LLM). */
export function describeEvent(e: TurnEvent): string {
  if (!e.hit) return `${e.attacker} utilise ${e.move}… mais l'attaque échoue !`;
  let line = `${e.attacker} utilise ${e.move} : `;
  if (e.effectiveness === 0) line += `ça n'affecte pas ${e.target}.`;
  else {
    line += `${e.damage} dégâts`;
    if (e.effectiveness > 1) line += " (super efficace !)";
    else if (e.effectiveness < 1) line += " (peu efficace…)";
    line += ".";
  }
  if (e.fainted) line += ` ${e.target} est K.O. !`;
  return line;
}
