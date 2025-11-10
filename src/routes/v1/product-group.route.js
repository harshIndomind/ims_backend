const router = require('express').Router();
const productGroupController = require('../../controllers/productGroup.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');

router.use(verifyToken); // all routes protected

router.post('/', productGroupController.createProductGroup);
router.get('/', productGroupController.getAllProductGroups);
router.get('/:id', productGroupController.getProductGroup);
router.put('/:id', productGroupController.updateProductGroup);
router.delete('/:id', productGroupController.deleteProductGroup);

module.exports = router;
