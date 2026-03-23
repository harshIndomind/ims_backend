const express = require('express');
const router = express.Router();
const RoleController = require('../../controllers/role.controller');
const checkRole = require('../../middlewares/checkRole');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);

router.post('/', RoleController.create);
router.get(
  '/:id/permissions',
//   checkPermission('roles', 'view'),
  RoleController.getRolePermissions
);
router.post(
  '/:id/permissions',
//   checkPermission('roles', 'edit'),
  RoleController.saveRolePermissions
);
router.put('/:id', RoleController.update);
router.delete('/:id', RoleController.destory);
router.get('/:id', RoleController.getRoleById);
router.get('/', RoleController.getAllRoles);
router.post('/menus/assign', RoleController.assignRoleMenus);
router.get('/:roleId/menus', RoleController.getAssignedMenus);

module.exports = router;
