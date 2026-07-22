const express = require('express')
const router = express.Router();
const DashboardController = require('../../controllers/dashboard.controller');
const checkPermission = require('../../middlewares/checkPermission');
const verifyToken = require('../../middlewares/verifyToken');
const uploadTo = require('../../middlewares/multer')

router.use(verifyToken);

router.get('/', DashboardController.getDashboardCounts);
router.get('/head-counts', checkPermission('major-head', 'view'), DashboardController.getMasterHeadCounts);
router.get('/summary', DashboardController.getDashboardSummary);
router.get('/uploads-charts-data', DashboardController.getDashboardChartsData);

module.exports = router;