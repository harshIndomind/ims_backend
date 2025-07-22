const express = require('express');
const router = express.Router();
const RoleController = require('../../controllers/role.controller');
const checkRole = require('../../middlewares/checkRole');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);

router.post('/', RoleController.create);
router.put('/:id', RoleController.update);
router.delete('/:id', RoleController.destory);
router.get('/:id', RoleController.getRoleById);
router.get('/', RoleController.getAllRoles);
router.post('/menus/assign', RoleController.assignRoleMenus);
router.get('/:roleId/menus', RoleController.getAssignedMenus);

module.exports = router;
