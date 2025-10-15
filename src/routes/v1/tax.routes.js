const express = require('express');
const router = express.Router();
const taxController = require('../../controllers/tax.controller');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);

router.post('/', taxController.createTax);
router.get('/', taxController.getAllTaxes);
router.get('/:id', taxController.getTaxById);
router.put('/:id', taxController.updateTax);
router.delete('/:id', taxController.deleteTax);

module.exports = router;

