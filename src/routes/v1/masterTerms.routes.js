const router = require('express').Router();
const MasterTermsController = require('../../controllers/masterTerms.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	// checkPermission('major-head', 'create'),
	MasterTermsController.createMasterTerms
);
router.put(
	'/:id',
	// checkPermission('major-head', 'edit'),
	MasterTermsController.updateMasterTerms
);
router.get(
	'/',
	// checkPermission('major-head', 'view'),
	MasterTermsController.getAllMasterTerms
);
router.get(
	'/:id',
	// checkPermission('major-head', 'view'),
	MasterTermsController.getMasterTermsById
);
router.delete(
	'/:id',
	// checkPermission('major-head', 'delete'),
	MasterTermsController.deleteMasterTerms
);

module.exports = router;
