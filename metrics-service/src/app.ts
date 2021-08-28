import { logger } from './shared/logger';
import { syncMetrics } from './services/metrics.service';

async function main() {
  try {
    await syncMetrics();
  } catch (err) {
    logger.error('Error running process');
  }
}

main().then(() => (main));
