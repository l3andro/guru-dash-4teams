import { IJiraQueryCustomField, IJiraQuery, IJiraLeadTime, IJiraLeadTimeHist, IJiraLeadTimeHistItems } from '../jira.types';
import { getJiraQuerySearchUrl, getPropertiesForCustomFields } from './jira.queryUtils';
import { getQuery } from '../jira.send';
import { IPoint } from 'influx';
import { logger } from '../../../shared/logger';

export async function getJiraIssues(url: string, apiVersion: string, authUser: string, authPass:string, jiraQuery: IJiraQuery) {
    const result: IPoint[] = [];

    const urlJiraQuery = getJiraQuerySearchUrl(url, apiVersion, jiraQuery);

    let next = true;
    let startAt = 0;
    let page = 1;
    while (next){
      const queryBugsResult = await getQuery({auth: { username: authUser, password: authPass }}, urlJiraQuery.concat(`&startAt=${startAt}`));
      
      const total = queryBugsResult.data.total;
      const maxResults = queryBugsResult.data.maxResults;

      logger.info(`Retrieving: ${total} items.`);
      logger.info(`Max results: ${maxResults}.`);
      logger.info(`Start at: ${startAt}.`);

      for(const issue of queryBugsResult.data.issues){
        logger.info(`Getting info about issue key: ${issue.key} <<<<<<<<<<<<<<<<<<<<<<`);
        result.push(await map(url, apiVersion, authUser, authPass, jiraQuery, issue));
      }
      
      next = page < total / maxResults;
      page++;
      startAt += maxResults;
    }
    return result
}

async function map(url: string, apiVersion: string, authUser: string, authPass:string, jiraQuery: IJiraQuery, issue: any):Promise<IPoint> {
    const createdDate:Date = new Date(issue.fields.created);
    
    const bugWorklogTime = await calculateIssueWorklogTime(url, apiVersion, authUser, authPass, issue.id);

    let register:IPoint =  {
      measurement: jiraQuery.name,
      timestamp: createdDate,
    };
    
    let leadTimeTotal = issue.fields?.resolutiondate ? (new Date(issue.fields.resolutiondate).getTime() - createdDate.getTime()) : 0;
    let leadTimeReadyToDiscover = await calculateLeadTime("Pronto para Descoberta",issue.changelog);
    let leadTimeAnalise = await calculateLeadTime("Análise",issue.changelog);

    if (leadTimeReadyToDiscover != 0){
      leadTimeReadyToDiscover = (new Date(leadTimeReadyToDiscover).getTime() - new Date(createdDate).getTime())
    }

    if(leadTimeAnalise != 0 ){
      leadTimeAnalise = (new Date(leadTimeAnalise).getTime() - new Date(createdDate).getTime())
    }

    let leadTimeDiscover = await calculateLeadTime("Descoberta",issue.changelog);
    let leadTimeBacklog = await calculateLeadTime("Backlog",issue.changelog);
    let leadTimeReadyDevelop = await calculateLeadTime("Pronto para desenvolvimento",issue.changelog);
    let leadTimeDevelop = await calculateLeadTime("Desenvolvimento",issue.changelog);
    let leadTimeDevelopDone = await calculateLeadTime("Desenvolvimento Concluído",issue.changelog);
    let leadTimeSitUatRegress = await calculateLeadTime("SIT/UAT e Regressivo",issue.changelog);
    let leadTimeReadyImplement = await calculateLeadTime("Pronto para Implantação",issue.changelog);
    let leadTimePilot = await calculateLeadTime("Piloto",issue.changelog);
    let leadTimeDone = await calculateLeadTime("Feito",issue.changelog);

    const ipointTags:any = {
      issueName: issue.key,
      issueType: issue.fields.issuetype.name,
      statusCategory: issue.fields?.status?.statusCategory?.name || "Not classified",
      bugWorklogTime: bugWorklogTime || 0,
      leadTimeTotal: leadTimeTotal || 0,
      leadTimeReadyDiscover: leadTimeReadyToDiscover || 0,
      leadTimeAnalise: leadTimeAnalise || 0,
      leadTimeDiscover: leadTimeDiscover || 0,
      leadTimeBacklog: leadTimeBacklog || 0 ,
      leadTimeReadyDevelop: leadTimeReadyDevelop || 0,
      leadTimeDevelop: leadTimeDevelop || 0,
      leadTimeDevelopDone: leadTimeDevelopDone || 0,
      leadTimeSitUatRegress: leadTimeSitUatRegress || 0,
      leadTimeReadyImplement: leadTimeReadyImplement || 0,
      leadTimePilot: leadTimePilot || 0,
      leadTimeDone: leadTimeDone || 0,
    };

    const ipointFields:any = {
      issueName: issue.key,
      issueType: issue.fields.issuetype.name,
      statusCategory: issue.fields?.status?.statusCategory?.name || "Not classified",
      bugWorklogTime: bugWorklogTime || 0,
      leadTimeTotal: leadTimeTotal || 0,
      leadTimeReadyDiscover: leadTimeReadyToDiscover || 0,
      leadTimeAnalise: leadTimeAnalise || 0,
      leadTimeDiscover: leadTimeDiscover || 0,
      leadTimeBacklog: leadTimeBacklog || 0 ,
      leadTimeReadyDevelop: leadTimeReadyDevelop || 0,
      leadTimeDevelop: leadTimeDevelop || 0,
      leadTimeDevelopDone: leadTimeDevelopDone || 0,
      leadTimeSitUatRegress: leadTimeSitUatRegress || 0,
      leadTimeReadyImplement: leadTimeReadyImplement || 0,
      leadTimePilot: leadTimePilot || 0,
      leadTimeDone: leadTimeDone || 0,
    };

    const customFields:IJiraQueryCustomField[] = jiraQuery.customFields;
    const iPointPropertiesForCustomFields = getPropertiesForCustomFields(customFields, issue);

    register.tags = { ...ipointTags, ...iPointPropertiesForCustomFields.ipointTags };
    register.fields = {...ipointFields, ...iPointPropertiesForCustomFields.ipointFields };
    
    return register;
  }

  async function calculateIssueWorklogTime(url: string, apiVersion: string, authUser: string, authPass:string, issueId: number){
    logger.info(`IssueId to get worklog: ${issueId}`);
    
    const urlJiraGetWorklog = url.concat(`/rest/api/${apiVersion}/issue/${issueId}/worklog`);
    const queryWorklogResult = await getQuery({auth: { username: authUser, password: authPass }}, urlJiraGetWorklog);
    
    logger.info(`Retrieving: ${queryWorklogResult.data.total} worklog items.`);
  
    let totalTimespent = 0;
    for(const worklog of queryWorklogResult.data?.worklogs){
      totalTimespent += worklog.timeSpentSeconds;
    }
    return totalTimespent;
  }

  async function calculateLeadTime(leadTimeInputName: string, changeLog: IJiraLeadTime){
    logger.info(`Get Lead Time By Transition`);
    
    const changeLogHist = changeLog.histories;
    let leadTimeResult = 0;
    let leadTimeResultOld:any;

    for  (let i=0; i < changeLogHist.length; i++){
      let leadTimesHist:IJiraLeadTimeHist = changeLogHist[i];
      let leadTimeDesc:IJiraLeadTimeHistItems = leadTimesHist.items[0];

      if (leadTimeDesc.toString == leadTimeInputName){
        leadTimeResultOld = leadTimesHist.created;
      }
      if (leadTimeDesc.fromString == leadTimeInputName){
        leadTimeResult = (new Date(leadTimesHist.created).getTime() - new Date(leadTimeResultOld).getTime());
      }

      if (leadTimeInputName == "Pronto para Descoberta" && leadTimeDesc.fromString == leadTimeInputName){
        leadTimeResult = leadTimesHist.created;
      }
      if (leadTimeInputName == "Análise" && leadTimeDesc.fromString == leadTimeInputName){
        leadTimeResult = leadTimesHist.created;
      }
    }
    return leadTimeResult;
  }
