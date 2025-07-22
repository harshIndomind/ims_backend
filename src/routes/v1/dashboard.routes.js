const express = require('express')
const router = express.Router();
const DashboardController = require('../../controllers/dashboard.controller');
const checkRole = require('../../middlewares/checkRole');
const verifyToken = require('../../middlewares/verifyToken');
const uploadTo = require('../../middlewares/multer')

router.use(verifyToken);

router.get('/',checkRole(['Super Admin', 'Admin', 'Vendor']), DashboardController.getDashboardCounts);
router.get('/uploads-charts-data',checkRole(['Super Admin', 'Admin', 'Vendor']), DashboardController.getDashboardChartsData);

module.exports = router;