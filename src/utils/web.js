import LensWebCrawler from "../lib/crawler.js";
import NodeCache from "node-cache";
import * as DB from './db.js';
import * as Util from './helper.js';

const crawler = new LensWebCrawler();
const Cache = new NodeCache({ stdTTL: 1800, checkperiod: 600 });

async function search(searchTerm) {
    let result = [];
    try {
        if (searchTerm.startsWith('https://lensstudio.snapchat.com/creator/')) {
            const slug = searchTerm.substr(searchTerm.lastIndexOf('/') + 1);
            return await searchByCreatorSlug(slug);
        }

        const uuid = Util.parseLensUuid(searchTerm);
        if (uuid) {
            result = await crawler.getLensByHash(uuid) || [];
            if (!Array.isArray(result)) {
                result = [result];
            }
        } else {
            result = await crawler.searchLenses(searchTerm);
        }

        return await Promise.all(result.map(async lens => {
            if (lens.user_display_name && !lens.obfuscated_user_slug) {
                lens.obfuscated_user_slug = await DB.getObfuscatedSlugByDisplayName(lens.user_display_name);
            }
            lens.web_import = 1;
            return lens;
        }));
    } catch (e) {
        console.error(e);
    }

    return result;
}

async function searchByUserName(userDisplayName) {
    const obfuscated_user_slug = await DB.getObfuscatedSlugByDisplayName(userDisplayName);
    if (obfuscated_user_slug) {
        return await searchByCreatorSlug(obfuscated_user_slug);
    }

    return [];
}

async function searchByCreatorSlug(obfuscatedUserSlug) {
    let lenses = [];
    for (let offset = 0; offset < 1000; offset += 100) {
        let result = await crawler.getLensesByCreator(obfuscatedUserSlug, offset, 100);
        lenses = lenses.concat(result);
        if (result.length < 100) {
            break;
        }
    }

    return lenses.map(lens => {
        lens.web_import = 1;
        return lens;
    });
}

async function getLensByHash(uuid) {
    return await crawler.getLensByHash(uuid);
}

async function getUnlockByHash(uuid) {
    // alias function
    return await getLensByHash(uuid);
}

async function mirrorSearchResults(webResults) {
    if (webResults && webResults.length) {
        for (let i = 0; i < webResults.length; i++) {
            if (webResults[i].uuid) {
                try {
                    // object has both lens/unlock attributes on success (with more info)
                    const lens = await getLensByHash(webResults[i].uuid);
                    if (lens && lens.unlockable_id && lens.lens_name && lens.user_display_name) {
                        await DB.insertLens(lens);
                    } else {
                        await DB.insertLens(webResults[i]);
                    }

                    // there is no fallback for the unlock
                    if (lens && lens.lens_id && lens.lens_url) {
                        await DB.insertUnlock(lens);
                    }
                } catch (e) {
                    console.error(e);
                }
            }
        }
    }
}

export { Cache, search, searchByUserName, searchByCreatorSlug, getLensByHash, getUnlockByHash, mirrorSearchResults }