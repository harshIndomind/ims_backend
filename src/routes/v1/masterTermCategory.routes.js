const router = require('express').Router();
const MasterTermCategoryController = require('../../controllers/mastertermcategory.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken); // all routes protected

router.post('/',checkPermission('terms-category', 'create') ,MasterTermCategoryController.createTermCategory);


router.get('/active', checkPermission('terms-category', 'view'), MasterTermCategoryController.getActiveTermCategories);

router.get('/', checkPermission('terms-category', 'view'), MasterTermCategoryController.getAllTermCategories);
router.get('/:id', checkPermission('terms-category', 'view'), MasterTermCategoryController.getTermCategoryById);
router.put('/:id', checkPermission('terms-category', 'edit'), MasterTermCategoryController.updateTermCategory);
router.patch('/:id/toggle', checkPermission('terms-category', 'edit'), MasterTermCategoryController.toggleTermCategoryStatus);
router.delete('/:id', checkPermission('terms-category', 'delete'), MasterTermCategoryController.deleteTermCategory);

module.exports = router;