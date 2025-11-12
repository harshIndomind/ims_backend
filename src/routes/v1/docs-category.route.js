const router = require('express').Router();
const DocsCategoryController = require('../../controllers/document-category.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');
const {
	validationCreateDocument,
	validationUpdateDocument,
} = require('../../validations/DocumentCategory.validator');
const { validate } = require('../../middlewares/validate');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	checkRole(['Super Admin', 'Admin']),
	validationCreateDocument,
	validate,
	DocsCategoryController.createDocsCategory
);
router.put(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
    validationUpdateDocument,
	validate,
	DocsCategoryController.updateDocsCategory
);
router.delete(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	DocsCategoryController.deleteDocsCategory
);
router.get(
	'/',
	checkRole(['Super Admin', 'Admin', 'Vendor', 'Vendor-Customer']),
	DocsCategoryController.getAllDocsCategories
);
router.get(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	DocsCategoryController.getDocsCategory
);

module.exports = router;
