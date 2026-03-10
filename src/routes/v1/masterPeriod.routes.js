const router = require('express').Router();
const MasterPeriodController = require('../../controllers/masterPeriod.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	checkPermission('period', 'create'),
	MasterPeriodController.createMasterPeriod
);
router.put(
	'/:id',
	checkPermission('period', 'edit'),
	MasterPeriodController.updateMasterPeriod
);

router.get(
	'/',
	checkPermission('period', 'view'),
	MasterPeriodController.getAllMasterPeriod
);
router.get(
	'/majorhead/:major_head_id',
	checkPermission('period', 'view'),
	MasterPeriodController.getMasterPeriodByMajorHead
);
router.get(
	'/:id',
	checkPermission('period', 'view'),
	MasterPeriodController.getMasterPeriodById
);
router.delete(
	'/:id',
	checkPermission('period', 'delete'),
	MasterPeriodController.deleteMasterPeriod
);

module.exports = router;
