export const fieldsByQueryType: Record<string,string>  = {
    BUG: "issuekey, summary, status, issuetype, created, resolutiondate",
    HOUR: "created, timespent, issuetype, issuekey, summary",
    ISSUE: "issuekey, status, issuetype, created, resolutiondate, changelog"
};