const express = require('express');
const router = express.Router();
const CountryController = require('../../controllers/country.controller');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);

router.get('/', CountryController.getAllCountries);

module.exports = router;
