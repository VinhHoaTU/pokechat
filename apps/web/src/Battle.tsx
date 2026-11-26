import { useState } from "react";
import { api, ApiError, type BattleView, type FighterView, type TurnResult } from "./api";

interface LogEntry { lines: string[]; narration?: string | null }

function Card({ f, side }: { f: FighterView; side: "player" | "foe" }) {
  const pct = Math.round((f.hp / f.maxHp) * 100);
  const tone = pct > 50 ? "ok" : pct > 20 ? "warn" : "low";
  const sprite = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${side === "player" ? "back/" : ""}${f.id}.png`;
  return (
    <div className={`fighter ${side}`}>
      <img src={sprite} alt="" width={96} height={96} onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
      <div className="info">
        <strong>{f.name}</strong>
        <span className="types">{f.types.join(" / ")}</span>
        <div className="hp" role="progressbar" aria-valuemin={0} aria-valuemax={f.maxHp} aria-valuenow={f.hp} aria-label={`PV de ${f.name}`}>
          <div className={`fill ${tone}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="hpnum">{f.hp} / {f.maxHp} PV</span>
      </div>
    </div>
  );
}

export function Battle() {
  const [player, setPlayer] = useState("Pikachu");
  const [foe, setFoe] = useState("Salamèche");
  const [battle, setBattle] = useState<BattleView | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const fail = (e: unknown) => {
    setError(e instanceof ApiError ? e.message + (e.suggestions.length ? ` Tu voulais peut-être : ${e.suggestions.join(", ")} ?` : "") : "Erreur inattendue.");
  };

  async function start() {
    setBusy(true); setError(null); setHint(null);
    try {
      const r = await api.startBattle(player, foe);
      setBattle(r.battle);
      setLog([]);
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  const apply = (r: TurnResult) => {
    setBattle(r.battle);
    if (r.understood === false) return setHint(r.message ?? null);
    setHint(null);
    if (r.lines) setLog((l) => [{ lines: r.lines!, narration: r.narration }, ...l]);
  };

  async function act(run: () => Promise<TurnResult>) {
    if (busy) return;
    setBusy(true); setError(null);
    try { apply(await run()); } catch (e) { fail(e); } finally { setBusy(false); }
  }

  if (!battle) {
    return (
      <section className="setup">
        <p>Choisis ton Pokémon et ton adversaire (noms français ou anglais). Niveau 50, tour par tour, résolu par le serveur.</p>
        <label>Ton Pokémon<input value={player} onChange={(e) => setPlayer(e.target.value)} /></label>
        <label>Adversaire<input value={foe} onChange={(e) => setFoe(e.target.value)} /></label>
        <button className="primary" onClick={start} disabled={busy || !player.trim() || !foe.trim()}>{busy ? "Préparation…" : "Lancer le combat"}</button>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
    );
  }

  const over = battle.status !== "ongoing";
  return (
    <section className="arena">
      <div className="fighters">
        <Card f={battle.foe} side="foe" />
        <Card f={battle.player} side="player" />
      </div>

      {over ? (
        <div className={`result ${battle.status}`}>
          <strong>{battle.status === "won" ? `Victoire ! ${battle.foe.name} est K.O.` : `Défaite… ${battle.player.name} est K.O.`}</strong>
          <button className="primary" onClick={() => { setBattle(null); setLog([]); }}>Nouveau combat</button>
        </div>
      ) : (
        <>
          <div className="moves">
            {battle.player.moves.map((m) => (
              <button key={m.index} onClick={() => act(() => api.move(battle.id, m.index))} disabled={busy}>
                <strong>{m.name}</strong>
                <span>{m.type} · {m.category}</span>
                <span>Puissance {m.power} · Précision {m.accuracy ?? "—"}</span>
              </button>
            ))}
          </div>
          <div className="composer">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { const t = text; setText(""); act(() => api.say(battle.id, t)); } }}
              placeholder="Ou écris l'attaque : « Tonnerre », « 2 »…"
              aria-label="Choisir une attaque par texte"
              maxLength={200}
            />
          </div>
        </>
      )}
      {hint && <p className="hint" role="status">{hint}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {busy && <p className="muted">Tour en cours…</p>}

      <ol className="log" aria-label="Journal du combat">
        {log.map((e, i) => (
          <li key={log.length - i}>
            {e.narration && <p className="narration">{e.narration}</p>}
            {e.lines.map((l, j) => <p key={j}>{l}</p>)}
          </li>
        ))}
      </ol>
    </section>
  );
}
