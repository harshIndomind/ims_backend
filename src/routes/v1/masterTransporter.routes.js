const router = require('express').Router();
const MasterTransporterController = require('../../controllers/masterTransporter.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	// checkPermission('major-head', 'create'),
	MasterTransporterController.createMasterTransporter
);
router.put(
	'/:id',
	// checkPermission('major-head', 'edit'),
	MasterTransporterController.updateMasterTransporter
);
router.get(
	'/',
	// checkPermission('major-head', 'view'),
	MasterTransporterController.getAllMasterTransporter
);
router.get(
	'/:id',
	// checkPermission('major-head', 'view'),
	MasterTransporterController.getMasterTransporterById
);
router.delete(
	'/:id',
	// checkPermission('major-head', 'delete'),
	MasterTransporterController.deleteMasterTransporter
);

module.exports = router;
