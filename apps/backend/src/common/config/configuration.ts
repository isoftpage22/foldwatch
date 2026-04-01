const defaultInterval = parseInt(
  process.env.DEFAULT_CRAWL_INTERVAL_MINUTES || '30',
  10,
);
const allowedDefault = [5, 15, 30].includes(defaultInterval)
  ? defaultInterval
  : 30;

export default () => ({
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '3306', 10),
    name: process.env.DATABASE_NAME || 'foldwatch',
    user: process.env.DATABASE_USER || 'root',
    pass: process.env.DATABASE_PASS || '',
  },
  app: {
    defaultCrawlIntervalMinutes: allowedDefault,
  },
  ai: {
    provider: process.env.AI_PROVIDER || 'gemini',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    claudeModel: process.env.CLAUDE_MODEL || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_MODEL || '',
  },
  crawl: {
    concurrency: parseInt(process.env.CRAWL_CONCURRENCY || '3', 10),
    maxAgentSteps: parseInt(process.env.MAX_AGENT_STEPS || '15', 10),
  },
});
