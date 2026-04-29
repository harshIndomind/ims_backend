const express = require('express');
const router = express.Router();
const PermissionController = require('../../controllers/permission.controller');
const checkRole = require('../../middlewares/checkRole');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);

router.post('/', PermissionController.create);
router.put('/:id', PermissionController.update);
router.delete('/:id', PermissionController.destory);
router.get('/:id', PermissionController.getPermissionById);
router.get('/', PermissionController.getAllPermissions);

module.exports = router;
