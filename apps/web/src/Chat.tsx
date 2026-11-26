import { useEffect, useRef, useState } from "react";
import { api, ApiError, type Msg } from "./api";

const EXAMPLES = ["Quelles sont les stats de Dracaufeu ?", "Contre quoi le type feu est-il efficace ?", "Comment évolue Salamèche ?"];

export function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [messages, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setError(null);
    setBusy(true);
    try {
      const r = await api.chat(next);
      setMessages([...next, { role: "assistant", content: r.reply, toolsUsed: r.toolsUsed }]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erreur inattendue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="chat">
      <div className="thread" aria-live="polite">
        {messages.length === 0 && (
          <div className="empty">
            <p>Pose une question sur un Pokémon, une attaque, un type ou une évolution. Les réponses viennent de PokéAPI, pas de la mémoire du modèle.</p>
            <div className="chips">
              {EXAMPLES.map((e) => <button key={e} className="chip" onClick={() => send(e)}>{e}</button>)}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            <p>{m.content}</p>
            {m.role === "assistant" && (
              <small className={m.toolsUsed?.length ? "source" : "source none"}>
                {m.toolsUsed?.length ? `Données PokéAPI : ${[...new Set(m.toolsUsed)].join(", ")}` : "Aucune donnée consultée : à vérifier"}
              </small>
            )}
          </div>
        ))}
        {busy && <div className="bubble assistant pending">Je consulte PokéAPI…</div>}
        {error && <p className="error" role="alert">{error}</p>}
        <div ref={end} />
      </div>
      <div className="composer">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Ex. Quel est le type de Pikachu ?"
          aria-label="Ta question"
          maxLength={2000}
        />
        <button className="primary" onClick={() => send(input)} disabled={busy || !input.trim()}>Envoyer</button>
      </div>
    </section>
  );
}
