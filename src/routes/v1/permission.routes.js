const express = require('express');
const router = express.Router();
const PermissionController = require('../../controllers/permission.controller');
const checkRole = require('../../middlewares/checkRole');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);

router.post('/', checkRole(['Super Admin', 'Admin']), PermissionController.create);
router.put('/:id', checkRole(['Super Admin', 'Admin']), PermissionController.update);
router.delete('/:id', checkRole(['Super Admin', 'Admin']), PermissionController.destory);
router.get('/:id', checkRole(['Super Admin', 'Admin']), PermissionController.getPermissionById);
router.get('/', checkRole(['Super Admin', 'Admin']), PermissionController.getAllPermissions);

module.exports = router;
