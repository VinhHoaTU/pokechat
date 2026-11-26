import { useEffect, useState } from "react";
import { api, type Health } from "./api";
import { Battle } from "./Battle";
import { Chat } from "./Chat";

export function App() {
  const [tab, setTab] = useState<"chat" | "battle">("chat");
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ model: "?", ollamaReachable: false, modelInstalled: false }));
  }, []);

  const problem = health && !health.ollamaReachable
    ? "Ollama ne répond pas. Lance « ollama serve » puis recharge la page."
    : health && !health.modelInstalled
      ? `Le modèle ${health.model} n'est pas installé. Lance : ollama pull ${health.model}`
      : null;

  return (
    <div className="app">
      <header>
        <h1>Pokéchat</h1>
        <nav role="tablist">
          <button role="tab" aria-selected={tab === "chat"} onClick={() => setTab("chat")}>Questions</button>
          <button role="tab" aria-selected={tab === "battle"} onClick={() => setTab("battle")}>Combat</button>
        </nav>
      </header>
      {problem && <p className="banner" role="alert">{problem}</p>}
      <main>{tab === "chat" ? <Chat /> : <Battle />}</main>
    </div>
  );
}
