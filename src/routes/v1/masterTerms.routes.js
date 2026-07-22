const router = require('express').Router();
const MasterTermsController = require('../../controllers/masterTerms.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	checkPermission('terms-conditions', 'create'),
	MasterTermsController.createMasterTerms
);
router.put(
	'/:id',
	checkPermission('terms-conditions', 'edit'),
	MasterTermsController.updateMasterTerms
);
router.get(
	'/',
	checkPermission('terms-conditions', 'view'),
	MasterTermsController.getAllMasterTerms
);
router.get(
	'/:id',
	checkPermission('terms-conditions', 'view'),
	MasterTermsController.getMasterTermsById
);
router.delete(
	'/:id',
	checkPermission('terms-conditions', 'delete'),
	MasterTermsController.deleteMasterTerms
);

module.exports = router;
