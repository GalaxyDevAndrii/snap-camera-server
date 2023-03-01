import mysql from "mysql2";
import * as dotenv from 'dotenv';
import * as Util from './helper.js';

dotenv.config();

const connection = mysql.createPool({
	host: process.env.DB_HOST,
	port: process.env.DB_PORT,
	user: process.env.DB_USER,
	password: process.env.DB_PASS,
	database: process.env.DB_NAME,
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0
});

const enableWebSource = Util.isOptionTrue('ENABLE_WEB_SOURCE');
const ignoreAltMedia = Util.isOptionTrue('IGNORE_ALT_MEDIA');
const ignoreImgSequence = Util.isOptionTrue('IGNORE_IMG_SEQUENCE');

function webImportFilter(arr) {
	if (!enableWebSource) {
		return arr.filter(element => (!element.web_import));
	}
	return arr;
}

function lensesMediaFilter(lenses) {
	if (ignoreAltMedia || ignoreImgSequence) {
		return lenses.map(lens => {
			// other media can be ignored if thumbnail_media is present
			if (!lens.thumbnail_media_url) lens.thumbnail_media_url = lens.thumbnail_media_poster_url || "";
			if (ignoreAltMedia) {
				lens.standard_media_url = '';
				lens.standard_media_poster_url = '';
				lens.image_sequence = {};
			} else {
				lens.image_sequence = {};
			}
			return lens;
		});
	}
	return lenses;
}

function searchLensByName(term) {
	const wildcardSearch = '%' + term + '%';
	return new Promise(resolve => {
		connection.query(`SELECT * FROM lenses WHERE lens_name LIKE ? OR user_display_name LIKE ? LIMIT 250;`, [
			wildcardSearch,
			wildcardSearch
		], async function (err, results) {
			if (results && results[0]) {
				resolve(
					lensesMediaFilter(
						webImportFilter(results)
					)
				);
			} else {
				if (err) {
					console.error(err, wildcardSearch);
				}
				resolve([]);
			}
		});
	});
}

function searchLensByTags(hashtags) {
	const regSearch = hashtags.join('|');
	return new Promise(resolve => {
		connection.query(`SELECT * FROM lenses WHERE lens_tags REGEXP (?) LIMIT 250;`, [
			regSearch
		], async function (err, results) {
			if (results && results[0]) {
				resolve(
					lensesMediaFilter(
						webImportFilter(results)
					)
				);
			} else {
				if (err) {
					console.error(err, regSearch);
				}
				resolve([]);
			}
		});
	});
}

function searchLensByUuid(uuid) {
	return new Promise(resolve => {
		connection.query(`SELECT * FROM lenses WHERE uuid=? LIMIT 1;`, [
			uuid
		], async function (err, results) {
			if (results && results[0]) {
				resolve(
					lensesMediaFilter(
						webImportFilter(results)
					)
				);
			} else {
				if (err) {
					console.error(err, uuid);
				}
				resolve([]);
			}
		});
	});
}

function getDuplicatedLensIds(lensIds) {
	return new Promise(resolve => {
		connection.query(`SELECT web_import, unlockable_id as id FROM lenses WHERE unlockable_id IN (?);`, [
			lensIds
		], async function (err, results) {
			if (results && results[0]) {
				resolve(
					webImportFilter(results).map(obj => {
						return parseInt(obj.id);
					})
				);
			} else {
				if (err) {
					console.error(err, lensIds);
				}
				resolve([]);
			}
		})
	});
}

function getMultipleLenses(lenses) {
	return new Promise(resolve => {
		connection.query(`SELECT * FROM lenses WHERE unlockable_id IN (?);`, [
			lenses
		], async function (err, results) {
			if (results && results[0]) {
				resolve(
					lensesMediaFilter(
						webImportFilter(results)
					)
				);
			} else {
				if (err) {
					console.error(err, lenses);
				}
				resolve([]);
			}
		})
	});
}

function getSingleLens(lensId) {
	return new Promise(resolve => {
		connection.query(`SELECT * FROM lenses WHERE unlockable_id=? LIMIT 1;`, [
			lensId
		], async function (err, results) {
			if (results && results[0]) {
				resolve(
					lensesMediaFilter(
						webImportFilter(results)
					)
				);
			} else {
				if (err) {
					console.error(err, lensId);
				}
				resolve([]);
			}
		});
	});
}

function getLensUnlock(lensId) {
	return new Promise(resolve => {
		connection.query(`SELECT * FROM unlocks WHERE lens_id=? LIMIT 1;`, [
			lensId
		], async function (err, results) {
			if (results && results[0]) {
				resolve(webImportFilter(results));
			} else {
				if (err) {
					console.error(err, lensId);
				}
				resolve([]);
			}
		});
	});
}

function getObfuscatedSlugByDisplayName(userDisplayName) {
	return new Promise(resolve => {
		connection.query(`SELECT obfuscated_user_slug as slug FROM users WHERE user_display_name=? LIMIT 1;`, [
			userDisplayName
		], async function (err, results) {
			if (results && results[0]) {
				resolve(results[0].slug);
			} else {
				if (err) {
					console.error(err, userDisplayName);
				}
				resolve('');
			}
		});
	});
}

async function insertLens(lenses, forceDownload = false) {
	if (!Array.isArray(lenses)) {
		lenses = [lenses];
	}

	for (const lens of lenses) {
		// check required fields
		if (!lens || !lens.unlockable_id || !lens.lens_name || !lens.user_display_name) {
			console.error("Invalid argument, expected lens object", lens);
			return;
		}

		let { unlockable_id, uuid, snapcode_url, user_display_name, lens_name, lens_tags, lens_status, deeplink, icon_url, thumbnail_media_url,
			thumbnail_media_poster_url, standard_media_url, standard_media_poster_url, obfuscated_user_slug, image_sequence, web_import } = lens;

		if (!image_sequence) image_sequence = {};

		await new Promise(resolve => {
			// rebuild the passed object manually
			// so we know exactly what will be inserted
			let args = {
				unlockable_id: unlockable_id,
				uuid: uuid || Util.parseLensUuid(deeplink),
				snapcode_url: snapcode_url,
				user_display_name: user_display_name,
				lens_name: lens_name,
				lens_tags: lens_tags || "",
				lens_status: lens_status || "Live",
				deeplink: deeplink || "",
				icon_url: icon_url || "",
				thumbnail_media_url: thumbnail_media_url || "",
				thumbnail_media_poster_url: thumbnail_media_poster_url || "",
				standard_media_url: standard_media_url || "",
				standard_media_poster_url: standard_media_poster_url || "",
				obfuscated_user_slug: obfuscated_user_slug || "",
				image_sequence: JSON.stringify(image_sequence),
				web_import: web_import || 0
			};

			try {
				connection.query(`INSERT INTO lenses SET ?`, args, async function (err, results) {
					if (!err) {
						if (obfuscated_user_slug) {
							insertUser(lens);
						}
						await Util.downloadLens(lens);
						console.log("Saved Lens:", unlockable_id);
					} else if (err.code !== "ER_DUP_ENTRY") {
						console.log(err, unlockable_id, lens_name);
						return resolve(false);
					} else if (forceDownload) {
						await Util.downloadLens(lens);
					}
					return resolve(true);
				});
			} catch (e) {
				console.error(e);
				resolve(false);
			}
		});
	}
}

async function insertUnlock(unlocks, forceDownload = false) {
	if (!Array.isArray(unlocks)) {
		unlocks = [unlocks];
	}

	for (const unlock of unlocks) {
		// check required fields
		if (!unlock || !unlock.lens_id || !unlock.lens_url) {
			console.error("Invalid argument, expected unlock object", unlock);
			return;
		}

		let { lens_id, lens_url, signature, hint_id, additional_hint_ids, web_import } = unlock;

		if (!additional_hint_ids) additional_hint_ids = {};

		await new Promise(resolve => {
			// rebuild the passed object manually
			// so we know exactly what will be inserted
			let args = {
				lens_id: lens_id,
				lens_url: lens_url,
				signature: signature || "",
				hint_id: hint_id || "",
				additional_hint_ids: JSON.stringify(additional_hint_ids),
				web_import: web_import || 0
			};

			try {
				connection.query(`INSERT INTO unlocks SET ?`, args, async function (err, results) {
					if (!err) {
						await Util.downloadUnlock(lens_id, lens_url);
						console.log('Unlocked Lens:', lens_id);
					} else if (err.code !== "ER_DUP_ENTRY") {
						console.log(err, lens_id);
						return resolve(false);
					} else if (forceDownload) {
						await Util.downloadUnlock(lens_id, lens_url);
					}
					return resolve(true);
				});
			} catch (e) {
				console.error(e);
				resolve(false);
			}
		});
	}
}

async function insertUser(user) {
	if (!user || !user.obfuscated_user_slug || !user.user_display_name) {
		console.error("Invalid argument, expected user object", user);
		return;
	}

	let { obfuscated_user_slug, user_display_name } = user;

	await new Promise(resolve => {
		// rebuild the passed object manually
		// so we know exactly what will be inserted
		let args = {
			obfuscated_user_slug: obfuscated_user_slug,
			user_display_name: user_display_name,
		};

		try {
			connection.query(`INSERT INTO users SET ?`, args, async function (err, results) {
				if (!err) {
					console.log('New User:', user_display_name);
				} else if (err.code !== "ER_DUP_ENTRY") {
					console.log(err, user);
					return resolve(false);
				}
				return resolve(true);
			});
		} catch (e) {
			console.error(e);
			resolve(false);
		}
	});
}

function markLensAsMirrored(id) {
	try {
		connection.query(`UPDATE lenses SET mirrored=1 WHERE unlockable_id=?`, [id]);
	} catch (e) {
		console.log(e);
	}
}

function markUnlockAsMirrored(id) {
	try {
		connection.query(`UPDATE unlocks SET mirrored=1 WHERE lens_id=?`, [id]);
	} catch (e) {
		console.log(e);
	}
}

export { searchLensByName, searchLensByTags, searchLensByUuid, getDuplicatedLensIds, getMultipleLenses, getSingleLens, getLensUnlock, getObfuscatedSlugByDisplayName, insertLens, insertUnlock, insertUser, markLensAsMirrored, markUnlockAsMirrored };