const express = require('express');
const router = express.Router();
const designationController = require('../../controllers/designation.controller');
const verifyToken = require('../../middlewares/verifyToken');

router.post('/', verifyToken, designationController.create);
router.get('/', verifyToken, designationController.findAll);

router.get('/:id', verifyToken, designationController.findOne);
router.put('/:id', verifyToken, designationController.update);
router.delete('/:id', verifyToken, designationController.remove);

module.exports = router;
