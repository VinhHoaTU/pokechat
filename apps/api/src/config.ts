export const config = {
  port: Number(process.env.PORT ?? 3000),
  ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
  model: process.env.OLLAMA_MODEL ?? "llama3.2", // qwen3:4b
  cacheDir: process.env.CACHE_DIR ?? ".cache",
};
