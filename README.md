# Pokéchat

Agent conversationnel Pokémon, 100 % local (Ollama), avec une petite interface web.

- **Questions** : on pose des questions en français ; l'agent interroge PokéAPI via des outils et ne répond qu'à partir de leurs résultats.
- **Combat** : combat au tour par tour contre un adversaire géré par le serveur. Le moteur est du code déterministe ; le LLM ne fait que raconter.

## Lancer le projet

Prérequis : [Bun](https://bun.sh), [Ollama](https://ollama.com).

```bash
ollama pull llama3.2        # modèle par défaut (voir plus bas)
ollama serve                # si Ollama n'est pas déjà lancé
bun install
bun run dev                 # API sur :3000, front sur http://localhost:5173
```

Autres commandes : `bun run test` (tests du moteur, de la résolution de noms et des outils), `bun run typecheck`.

Variables d'environnement (API) : `OLLAMA_MODEL` (défaut `qwen3:4b`), `OLLAMA_URL` (défaut `http://localhost:11434`), `PORT` (défaut `3000`), `CACHE_DIR` (défaut `.cache`).

Au premier lancement, l'API construit en arrière-plan l'index des noms français (~1000 requêtes, une seule fois, puis `.cache/fr-names.json`). Pendant ce temps, les noms anglais fonctionnent déjà ; les noms français sont acceptés dès que l'index est prêt (quelques minutes).


## Architecture et choix

```
apps/api  (Bun + Hono)
  pokeapi/   client avec cache mémoire + disque, timeout, retries ; résolution des noms FR/EN
  agent/     client Ollama, outils (get_pokemon, get_move, get_type_matchups, get_evolution_chain), boucle d'agent
  battle/    engine.ts (moteur pur), setup.ts (chargement des combattants), routes, store, narrateur
apps/web  (React + Vite)   deux onglets : Questions / Combat
```

**Fiabilité de l'agent (« ne pas inventer »)**
- Prompt système strict + outils obligatoires pour tout fait. Si le modèle répond sans outil, il est relancé une fois ; sinon l'interface affiche « Aucune donnée consultée : à vérifier ». Chaque réponse indique les outils utilisés.
- Les outils ne lèvent jamais d'exception : toute erreur (Pokémon inconnu, API indisponible, arguments invalides, outil inexistant) devient un résultat structuré que le modèle peut lire.
- Les correspondances approximatives de noms ne sont **jamais** acceptées automatiquement (risque de répondre sur le mauvais Pokémon) : on renvoie des suggestions.
- Le client ne peut envoyer que des messages `user`/`assistant` (validation zod) : impossible d'injecter un faux message `system` ou `tool`. Nombre d'itérations d'outils limité à 5.

**Combat : le code est l'arbitre, le LLM est le narrateur**
- L'état (PV, tour, graine du RNG) n'existe que côté serveur. Le client envoie uniquement un index d'attaque ; il ne voit ni la graine ni les attaques de l'adversaire.
- Moteur pur et déterministe (RNG à graine) : niveau 50, formule de dégâts simplifiée (STAB, efficacité des types depuis PokéAPI, précision, ordre par vitesse). Adversaire : meilleure attaque à dégât espéré.
- Le texte libre (« Tonnerre », « 2 ») est associé à une attaque légale **par le code** (`matchMove`), pas par le LLM. Si rien ne correspond, on demande de préciser.
- Le LLM reçoit les événements déjà calculés (sans chiffres) et produit 1 à 3 phrases de narration, facultatives. S'il échoue, le journal factuel généré par le code suffit.
- Verrou par combat (409 si deux requêtes simultanées).

**Données** : cache mémoire + disque (exigé par la politique de PokéAPI), requêtes dédupliquées, concurrence limitée, URLs restreintes à des slugs sûrs (PokéAPI bloque certains caractères).

**Stack** : Bun workspaces plutôt que Turborepo : pour deux apps, un `bun run --filter` suffit ; ajouter `turbo.json` serait trivial.

## Ce qui a été vérifié

- Tests unitaires (39) : formules de stats et de dégâts, STAB, immunités, double type, ordre de jeu, K.O., plafonnement des dégâts, déterminisme, attaque invalide, combat terminé, parsing du texte libre, normalisation des noms, robustesse des outils.
- Typecheck API + front, build du front, démarrage du serveur et chemins d'erreur (Ollama absent, PokéAPI injoignable, rôle `system` refusé, combat inconnu).
- **Non vérifié ici** : appels réels à PokéAPI et à Ollama (pas d'accès réseau/GPU dans mon environnement de génération). La première chose à faire est un essai de bout en bout sur ma machine.

## Limites et pistes

- Règles volontairement simplifiées : un seul niveau, pas de statuts, objets, critiques, talents, ni de changement de Pokémon.
- Les 4 attaques sont choisies parmi celles apprises par montée de niveau (60 premières examinées) : pas forcément les plus iconiques.
- `get_move` demande le nom anglais de l'attaque (pas d'index français pour les attaques) ; les talents sont renvoyés en anglais.
- Pas de détection des affirmations non fondées dans la réponse : le garde-fou est la contrainte d'outils + l'affichage des sources.
- États de combat en mémoire (perdus au redémarrage), pas d'authentification.
- Avec plus de temps : évaluation automatique de l'agent (jeu de questions + vérification des chiffres cités contre les résultats d'outils), index français des attaques, persistance des combats, streaming des réponses, règles de combat plus riches, tests d'intégration avec PokéAPI et Ollama simulés.
