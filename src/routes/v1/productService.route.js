const router = require('express').Router();
const verifyToken = require('../../middlewares/verifyToken');
const productService = require('../../controllers/productService.controller');

router.use(verifyToken); // all routes protected

const { upload } = require('../../middlewares/multer');
router.post('/', upload.array('product_images[]', 5), productService.createProduct);
router.get('/', productService.getAllProducts);
router.get('/organization/:organization_id', productService.getAllProductsByOrganization);
router.get('/:id', productService.getProductById);
router.put('/:id', upload.array('product_images[]', 5), productService.updateProduct);
router.delete('/:id', productService.deleteProduct);

module.exports = router;
