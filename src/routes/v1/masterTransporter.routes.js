const router = require('express').Router();
const MasterTransporterController = require('../../controllers/masterTransporter.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	checkPermission('transporters', 'create'),
	MasterTransporterController.createMasterTransporter
);
router.put(
	'/:id',
	checkPermission('transporters', 'edit'),
	MasterTransporterController.updateMasterTransporter
);
router.get(
	'/',
	checkPermission('transporters', 'view'),
	MasterTransporterController.getAllMasterTransporter
);
router.get(
	'/:id',
	checkPermission('transporters', 'view'),
	MasterTransporterController.getMasterTransporterById
);
router.delete(
	'/:id',
	checkPermission('transporters', 'delete'),
	MasterTransporterController.deleteMasterTransporter
);

module.exports = router;
