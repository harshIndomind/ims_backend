const express = require('express');
const router = express.Router();
const CountryController = require('../../controllers/country.controller');
const checkRole = require('../../middlewares/checkRole');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);

// router.post('/', RoleController.create);
// router.put('/:id', RoleController.update);
// router.delete('/:id', RoleController.destory);
// router.get('/:id', RoleController.getRoleById);
router.get('/', CountryController.getAllCountries);
// router.post('/menus/assign', RoleController.assignRoleMenus);
// router.get('/:roleId/menus', RoleController.getAssignedMenus);

module.exports = router;
