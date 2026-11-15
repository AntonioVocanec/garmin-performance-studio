import base from './playwright.config';
export default {...base,workers:1,outputDir:'tmp/nutrition-chart-empty-artifacts',webServer:{
...base.webServer,env:{...base.webServer.env,GARMIN_DASHBOARD_DB_PATH:"C:\\Users\\carti\\Documents\\ChatGPT\\Garmin Performance Studio\\tmp\\analytics-verification-20261115\\tmp\\nutrition-chart-empty-163839\\test.sqlite3",
GARMIN_DASHBOARD_BACKUP_DIR:"C:\\Users\\carti\\Documents\\ChatGPT\\Garmin Performance Studio\\tmp\\analytics-verification-20261115\\tmp\\nutrition-chart-empty-163839\\backups"}}};
