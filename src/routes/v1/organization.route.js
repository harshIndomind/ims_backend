const router = require('express').Router();
const OrganizationController = require('../../controllers/organization.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');

router.use(verifyToken); // all routes protected

router.post('/', checkRole(['Super Admin', 'Admin', 'Project Tech Head', 'User', 'Support Engineer']), OrganizationController.createOrganization);
router.put('/:id', checkRole(['Super Admin', 'Admin', 'Project Tech Head', 'User', 'Support Engineer']), OrganizationController.updateOrganization);
router.delete('/:id', checkRole(['Super Admin', 'Admin', 'Project Tech Head', 'User', 'Support Engineer']), OrganizationController.deleteOrganization);
router.get('/', checkRole(['Super Admin', 'Admin', 'Project Tech Head', 'User', 'Support Engineer']), OrganizationController.getAllOrganizations);
router.get('/:id', checkRole(['Super Admin', 'Admin', 'Project Tech Head', 'User', 'Support Engineer']), OrganizationController.getOrganization);

module.exports = router;
