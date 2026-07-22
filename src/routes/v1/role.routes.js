const express = require('express');
const router = express.Router();
const RoleController = require('../../controllers/role.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken);

router.post('/', checkPermission('roles', 'create'), RoleController.create);
router.get('/:id/permissions', checkPermission('roles-permissions', 'view'), RoleController.getRolePermissions);
router.post('/:id/permissions', checkPermission('roles-permissions', 'edit'), RoleController.saveRolePermissions);
router.put('/:id', checkPermission('roles', 'edit'), RoleController.update);
router.delete('/:id', checkPermission('roles', 'delete'), RoleController.destory);
router.get('/:id', checkPermission('roles', 'view'), RoleController.getRoleById);
router.get('/', checkPermission('roles', 'view'), RoleController.getAllRoles);
router.post('/menus/assign', checkPermission('roles', 'edit'), RoleController.assignRoleMenus);
router.get('/:roleId/menus', checkPermission('roles', 'view'), RoleController.getAssignedMenus);

module.exports = router;
