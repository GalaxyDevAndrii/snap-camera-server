import express from "express";
import lenses from './src/endpoints/lenses.js';
import categorylenses from './src/endpoints/category/lenses.js';
import top from './src/endpoints/top.js';
import unlock from './src/endpoints/unlock.js';
import categories from './src/endpoints/categories.js';
import scheduled from './src/endpoints/scheduled.js';
import search from './src/endpoints/search.js';
import deeplink from './src/endpoints/deeplink.js';
import reporting from './src/endpoints/reporting.js';
import latest from './src/endpoints/latest.js';
import download from './src/endpoints/download.js';
import importCache from './src/endpoints/import.js';
import v1 from './src/endpoints/v1.js';
import wildcard from './src/endpoints/wildcard.js';
import * as init from './src/utils/init.js';
import * as dotenv from 'dotenv';

dotenv.config();

const serverPort = process.env.PORT;
const enableCacheImport = process.env.ENABLE_CACHE_IMPORT;
const app = express();

app.use(express.json());
app.use('/vc/v1/explorer/lenses', lenses);
app.use('/vc/v1/explorer/category/lenses', categorylenses);
app.use('/vc/v1/explorer/top', top);
app.use('/vc/v1/explorer/unlock', unlock);
app.use('/vc/v1/explorer/categories', categories);
app.use('/vc/v1/explorer/scheduled', scheduled);
app.use('/vc/v1/explorer/search', search);
app.use('/vc/v1/explorer/deeplink_search', deeplink);
app.use('/vc/v1/reporting/lens', reporting);
app.use('/vc/v1/update/latest', latest);
app.use('/vc/v1/update/download', download);
if (enableCacheImport.toLowerCase() == 'true' || enableCacheImport == 1) {
	app.use('/vc/v1/import/cache', importCache);
}
app.use('/vc/v1', v1);
app.use('*', wildcard);

app.listen(serverPort, () => {
	console.log(`Snap Camera Server is running on port ${serverPort}`);
	init.bootstrap();
});
