const express = require('express');
const router = express.Router();
const reportController = require('../../controllers/reports.controller');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);
const { upload } = require('../../middlewares/multer');

router.post('/gstr1-report', reportController.generateGSTR1);

module.exports = router;
