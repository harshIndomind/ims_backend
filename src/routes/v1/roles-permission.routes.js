const express = require('express');
const router = express.Router();
const RolesPermissionController = require('../../controllers/roles-permission.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken);

router.post('/', checkPermission('roles-permissions','create'), RolesPermissionController.create);
router.put('/', checkPermission('roles-permissions','edit'), RolesPermissionController.update);
router.delete('/:id', checkPermission('roles-permissions','delete'), RolesPermissionController.destroy);
router.get('/', checkPermission('roles-permissions','view'), RolesPermissionController.getAll);
router.get('/:id', checkPermission('roles-permissions','view'), RolesPermissionController.getByRoleId);

module.exports = router;
