const router = require('express').Router();
const DocsCategoryController = require('../../controllers/document-category.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');

router.use(verifyToken); // all routes protected

router.post('/', checkRole(['Super Admin', 'Admin', 'Vendor', 'Vendor-Customer']), DocsCategoryController.createDocsCategory);
router.put('/:id', checkRole(['Super Admin', 'Admin', 'Vendor', 'Vendor-Customer']), DocsCategoryController.updateDocsCategory);
router.delete('/:id', checkRole(['Super Admin', 'Admin', 'Vendor', 'Vendor-Customer']), DocsCategoryController.deleteDocsCategory);
router.get('/', checkRole(['Super Admin', 'Admin', 'Vendor', 'Vendor-Customer']), DocsCategoryController.getAllDocsCategories);
router.get('/:id', checkRole(['Super Admin', 'Admin', 'Vendor', 'Vendor-Customer']), DocsCategoryController.getDocsCategory);

module.exports = router;
