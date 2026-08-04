import 'dotenv/config';
import { databaseInfo, ensurePublicProjectCatalog, readStoreAsync, resetStore } from './store';
import { clearActivity } from './activity';

const main = async () => {
  if (process.argv.includes('public')) {
    const seed = await ensurePublicProjectCatalog(100);
    const store = await readStoreAsync();
    console.log(JSON.stringify({
      database: databaseInfo(),
      seed: {
        requested: seed.requested,
        created: seed.created,
        existing: seed.existing,
        projects: seed.projectIds.length,
      },
      totals: {
        projects: store.projects.length,
        tasks: store.tasks.length,
        deployments: store.deployments.length,
        incidents: store.incidents.length,
        healthChecks: store.projectHealthChecks.length,
      },
    }, null, 2));
    return;
  }

  const store = await resetStore();
  await clearActivity();
  console.log(`Cleared local data. Projects: ${store.projects.length}, tasks: ${store.tasks.length}.`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
