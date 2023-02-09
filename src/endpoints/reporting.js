import express from 'express'
import * as DB from '../utils/db.js';

var router = express.Router();

router.post('/', async function (req, res, next) {
	//using the report lens feature of the app to try and redownload everything.
	const body = req.body;
	if (body && body['lens_id'] && parseInt(body['lens_id'])) {
		let lens = await DB.getSingleLens(parseInt(body['lens_id']));
		if (lens && lens[0]) {
			//re-mirror the lens
			DB.insertLens([lens[0]], true);
		}
	}
	return res.json({});
});

export default router;