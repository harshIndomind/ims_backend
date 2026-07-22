const express = require('express');
const router = express.Router();
const StateController = require('../../controllers/state.controller');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);

// router.post('/', RoleController.create);
// router.put('/:id', RoleController.update);
// router.delete('/:id', RoleController.destory);
// router.get('/:id', RoleController.getRoleById);
router.get('/', StateController.getAllStates);
// router.post('/menus/assign', RoleController.assignRoleMenus);
// router.get('/:roleId/menus', RoleController.getAssignedMenus);

module.exports = router;
