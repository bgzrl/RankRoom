import { buildServer } from './app.js';
import { loadConfig } from './config.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const server = await buildServer(config);

  const shutdown = async (signal: string): Promise<void> => {
    server.fastify.log.info(`Arrêt propre du serveur (${signal})...`);
    try {
      await server.close();
      process.exit(0);
    } catch (err) {
      server.fastify.log.error(err, "Erreur lors de l'arrêt du serveur.");
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  await server.fastify.listen({
    host: config.host,
    port: config.port,
  });
}

main().catch((err) => {
  console.error('Échec du démarrage de RankRoom :', err);
  process.exit(1);
});
