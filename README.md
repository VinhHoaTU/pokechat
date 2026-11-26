# Pokéchat

Agent conversationnel Pokémon avec une interface web. Le modèle tourne localement avec Ollama et les données Pokémon proviennent de PokéAPI.

- **Questions** : on pose des questions en français ; l'agent interroge PokéAPI via des outils et ne répond qu'à partir de leurs résultats.
- **Combat** : combat au tour par tour contre un adversaire géré par le serveur. Le moteur est du code déterministe ; le LLM ne fait que raconter.

## Lancer le projet

### Avec Docker Compose

Docker et Docker Compose v2 sont requis. Docker Desktop inclut les deux. [Installation de Docker Compose](https://docs.docker.com/compose/install/)

Depuis la racine du dépôt cloné, lance la commande suivante et ouvre ensuite [http://localhost:5173](http://localhost:5173).

```bash
docker compose up --build 
```

Au premier lancement, le service `ollama-model` télécharge le modèle par défaut `llama3.2` (environ 2 Go). Son statut `Exited (0)` indique que l'installation a réussi. Une connexion Internet est nécessaire pour télécharger les images et le modèle, ainsi que pour les requêtes PokéAPI dont les données sont absentes du cache. [Modèle llama3.2](https://ollama.com/library/llama3.2)

Le navigateur accède à l'interface et aux routes `/api` via le port `5173`. L'API écoute sur le port `3000` dans le réseau Docker. Si le port `5173` est déjà pris, ajoute `POKECHAT_PORT=5174` dans un fichier `.env` à la racine et ouvre [http://localhost:5174](http://localhost:5174). Tu peux aussi définir `OLLAMA_MODEL` dans ce fichier pour choisir le modèle à télécharger.

Pour arrêter l'application, lance `docker compose down`. Le modèle Ollama et le cache PokéAPI restent dans leurs volumes Docker.

### En développement avec Bun et Ollama

Installe Bun et Ollama. Si Ollama n'est pas démarré, lance `ollama serve` dans un terminal séparé. [Bun](https://bun.sh) · [Ollama](https://ollama.com)

```bash
ollama pull llama3.2
bun install
bun run dev
```

Ouvre [http://localhost:5173](http://localhost:5173). Vite transmet les requêtes `/api` à l'API sur le port `3000`.

Utilise `bun run test` pour lancer les tests unitaires et `bun run typecheck` pour vérifier les types.

En développement, l'API utilise `OLLAMA_MODEL=llama3.2`, `OLLAMA_URL=http://localhost:11434`, `PORT=3000` et `CACHE_DIR=.cache` par défaut.

### Premier chargement des noms français

L'API construit l'index des noms français en arrière-plan et enregistre `fr-names.json` dans le cache. Les noms anglais fonctionnent pendant l'indexation. Les noms français deviennent disponibles une fois l'index prêt.

## Architecture et choix

```
apps/api  (Bun + Hono)
  pokeapi/   client avec cache mémoire + disque, timeout, retries ; résolution des noms FR/EN
  agent/     client Ollama, outils (get_pokemon, get_move, get_type_matchups, get_evolution_chain), boucle d'agent
  battle/    engine.ts (moteur pur), setup.ts (chargement des combattants), routes, store, narrateur
apps/web  (React + Vite)   deux onglets : Questions / Combat
docker-compose.yml       interface servie par Nginx, API Bun et Ollama
```

**Fiabilité de l'agent (« ne pas inventer »)**
- Prompt système strict + outils obligatoires pour tout fait. Si le modèle répond sans outil, il est relancé une fois ; sinon l'interface affiche « Aucune donnée consultée : à vérifier ». Chaque réponse indique les outils utilisés.
- Les outils ne lèvent jamais d'exception : toute erreur (Pokémon inconnu, API indisponible, arguments invalides, outil inexistant) devient un résultat structuré que le modèle peut lire.
- Les correspondances approximatives de noms ne sont **jamais** acceptées automatiquement (risque de répondre sur le mauvais Pokémon) : on renvoie des suggestions.
- L'API valide les messages avec Zod et accepte les rôles `user` et `assistant`. La boucle de l'agent est limitée à 5 itérations.

**Combat : le code est l'arbitre, le LLM est le narrateur**
- Le serveur conserve l'état du combat et la graine du RNG. Le client envoie un index d'attaque ou une commande en texte libre et reçoit l'état visible du combat.
- Moteur pur et déterministe (RNG à graine) : niveau 50, formule de dégâts simplifiée (STAB, efficacité des types depuis PokéAPI, précision, ordre par vitesse). Adversaire : meilleure attaque à dégât espéré.
- Le texte libre (« Tonnerre », « 2 ») est associé à une attaque légale **par le code** (`matchMove`), pas par le LLM. Si rien ne correspond, on demande de préciser.
- Le LLM reçoit les événements déjà calculés (sans chiffres) et produit 1 à 3 phrases de narration, facultatives. S'il échoue, le journal factuel généré par le code suffit.
- Verrou par combat (409 si deux requêtes simultanées).

**Données** : cache mémoire + disque (exigé par la politique de PokéAPI), requêtes dédupliquées, concurrence limitée, URLs restreintes à des slugs sûrs (PokéAPI bloque certains caractères).

**Stack** : Bun workspaces plutôt que Turborepo : pour deux apps, un `bun run --filter` suffit ; ajouter `turbo.json` serait trivial.

## Ce qui a été vérifié

- Tests unitaires (39) : formules de stats et de dégâts, STAB, immunités, double type, ordre de jeu, K.O., plafonnement des dégâts, déterminisme, attaque invalide, combat terminé, parsing du texte libre, normalisation des noms, robustesse des outils.
- Typecheck API + front, build du front, démarrage du serveur et chemins d'erreur (Ollama absent, PokéAPI injoignable, rôle `system` refusé, combat inconnu).
- Exécution avec Docker Compose, téléchargement de `llama3.2`, chargement de l'interface, réponse du chat avec Ollama et création d'un combat à partir de données PokéAPI.

## Limites et pistes

- Règles volontairement simplifiées : un seul niveau, pas de statuts, objets, critiques, talents, ni de changement de Pokémon.
- Les 4 attaques sont choisies parmi celles apprises par montée de niveau (60 premières examinées) : pas forcément les plus iconiques.
- `get_move` demande le nom anglais de l'attaque (pas d'index français pour les attaques) ; les talents sont renvoyés en anglais.
- Pas de détection des affirmations non fondées dans la réponse : le garde-fou est la contrainte d'outils + l'affichage des sources.
- États de combat en mémoire (perdus au redémarrage), pas d'authentification.
- Avec plus de temps : évaluation automatique de l'agent (jeu de questions + vérification des chiffres cités contre les résultats d'outils), index français des attaques, persistance des combats, streaming des réponses, règles de combat plus riches, tests d'intégration avec PokéAPI et Ollama simulés.
