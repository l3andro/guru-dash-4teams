import { logger } from '../shared/logger';
import {providerFactory} from "../providers/provider.factory";
import {getDatasources} from "../providers/strapi/strapi.provider";
import {IDatasourceMetadata} from "./metrics.types";

export async function syncMetrics() {
  const datasources = await getDatasources();
  const scheduler = require('node-schedule');

  for (const datasource of datasources) {
    try {
      const dsCron = await getCron(datasource.meta);         

      if(dsCron){
        logger.info(`Scheduling next execution to datasource >> ${datasource.name} << with expression: ${dsCron}`);
        scheduler.scheduleJob(dsCron, async () => providerFactory(datasource));
      }
      else{
        logger.info(`Cron metadata not found in datasource >> ${datasource.name} << !!!`);
      }
    } catch (err) {
      logger.error(`Error processing ${datasource.name}`);
    }
  }
}

export async function getCron(metadata: IDatasourceMetadata) {
  const cron:string = metadata.cron
  return cron;
}