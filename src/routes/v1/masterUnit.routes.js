const router = require('express').Router();
const MasterUnitController = require('../../controllers/masterUnit.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	checkPermission('period', 'create'),
	MasterUnitController.createMasterUnit
);
router.put(
	'/:id',
	checkPermission('period', 'edit'),
	MasterUnitController.updateMasterUnit
);
router.get(
	'/',
	checkPermission('period', 'view'),
	MasterUnitController.getAllMasterUnit
);
router.get(
	'/check-short-name',
	checkPermission('period', 'view'),
	MasterUnitController.checkUnitShortName
);
router.get(
	'/:id',
	checkPermission('period', 'view'),
	MasterUnitController.getMasterUnitById
);
router.delete(
	'/:id',
	checkPermission('period', 'delete'),
	MasterUnitController.deleteMasterUnit
);

router.patch(
	'/:id/toggle-status',
	checkPermission('period', 'edit'),
	MasterUnitController.toggleMasterUnitStatus
);

module.exports = router;
