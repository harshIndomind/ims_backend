const express = require('express');
const router = express.Router();
const departmentController = require('../../controllers/department.controller');
const verifyToken = require('../../middlewares/verifyToken');

router.post('/', verifyToken, departmentController.create);
router.get('/', verifyToken, departmentController.findAll);
router.get('/:id/designations', verifyToken, departmentController.findDesignationsByDepartment);
router.get('/:id', verifyToken, departmentController.findOne);
router.put('/:id', verifyToken, departmentController.update);
router.delete('/:id', verifyToken, departmentController.remove);
module.exports = router;
