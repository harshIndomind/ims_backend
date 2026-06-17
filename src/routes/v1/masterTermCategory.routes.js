const router = require('express').Router();
const MasterTermCategoryController = require('../../controllers/mastertermcategory.controller');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken); // all routes protected

router.post('/', MasterTermCategoryController.createTermCategory);


router.get('/active', MasterTermCategoryController.getActiveTermCategories);

router.get('/', MasterTermCategoryController.getAllTermCategories);
router.get('/:id', MasterTermCategoryController.getTermCategoryById);
router.put('/:id', MasterTermCategoryController.updateTermCategory);
router.patch('/:id/toggle', MasterTermCategoryController.toggleTermCategoryStatus);
router.delete('/:id', MasterTermCategoryController.deleteTermCategory);

module.exports = router;