const express = require('express');
const router = express.Router();
const unitController = require('../../controllers/unit.controller');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);

router.post('/', unitController.createUnit);
router.get('/', unitController.getAllUnits);
router.get('/:id', unitController.getUnitById);
router.put('/:id', unitController.updateUnit);
router.delete('/:id', unitController.deleteUnit);

module.exports = router;
