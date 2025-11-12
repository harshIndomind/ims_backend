const express = require('express');
const router = express.Router();
const registrationTypeController = require('../../controllers/registration-type.controller');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);

router.get('/', registrationTypeController.getAllRegistrationTypes);
    
module.exports = router;
