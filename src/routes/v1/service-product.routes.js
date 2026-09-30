const router = require('express').Router();
const serviceProductController = require('../../controllers/service-product.controller');
const verifyServiceToken = require('../../middlewares/verifyServiceToken');

// Called by VCP before deactivating a product, to block it while SCM documents use it.
router.get('/:id/usage', verifyServiceToken, serviceProductController.getProductUsage);

module.exports = router;
