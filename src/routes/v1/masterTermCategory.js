const router = require('express').Router();
const MasterTermCategoryController = require('../../controllers/masterTermCategory.controller');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	// checkPermission('term-category', 'create'),
	MasterTermCategoryController.createTermCategory
);

router.put(
	'/:id',
	// checkPermission('term-category', 'edit'),
	MasterTermCategoryController.updateTermCategory
);

router.get(
	'/',
	// checkPermission('term-category', 'view'),
	MasterTermCategoryController.getAllTermCategories
);

router.get(
	'/active',
	// checkPermission('term-category', 'view'),
	MasterTermCategoryController.getActiveTermCategories  // for dropdown
);

router.get(
	'/:id',
	// checkPermission('term-category', 'view'),
	MasterTermCategoryController.getTermCategoryById
);

router.patch(
	'/:id/toggle',
	// checkPermission('term-category', 'edit'),
	MasterTermCategoryController.toggleTermCategoryStatus
);

router.delete(
	'/:id',
	// checkPermission('term-category', 'delete'),
	MasterTermCategoryController.deleteTermCategory
);

module.exports = router;