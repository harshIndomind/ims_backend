const router = require('express').Router();
const MasterUnitController = require('../../controllers/masterUnit.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	// checkPermission('major-head', 'create'),
	MasterUnitController.createMasterUnit
);
router.put(
	'/:id',
	// checkPermission('major-head', 'edit'),
	MasterUnitController.updateMasterUnit
);
router.get(
	'/',
	// checkPermission('major-head', 'view'),
	MasterUnitController.getAllMasterUnit
);
router.get(
	'/:id',
	// checkPermission('major-head', 'view'),
	MasterUnitController.getMasterUnitById
);
router.delete(
	'/:id',
	// checkPermission('major-head', 'delete'),
	MasterUnitController.deleteMasterUnit
);

router.patch(
	'/:id/toggle-status',
	MasterUnitController.toggleMasterUnitStatus
);

module.exports = router;
