const router = require('express').Router();
const OrganizationController = require('../../controllers/organization.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');
const { validate } = require('../../middlewares/validate');
const {
	validationCreateOrganization,
	validationUpdateOrganization,
} = require('../../validations/Organization.validator');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	checkRole(['Super Admin']),
	validationCreateOrganization,
	validate,
	OrganizationController.createOrganization
);
router.put(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	validationUpdateOrganization,
	validate,
	OrganizationController.updateOrganization
);
router.delete(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	OrganizationController.deleteOrganization
);
router.get(
	'/',
	checkRole(['Super Admin', 'Admin']),
	OrganizationController.getAllOrganizations
);
router.get(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	OrganizationController.getOrganization
);
router.get(
	'/organization/banks',
	checkRole(['Super Admin', 'Admin']),
	OrganizationController.getOrganizationBankDetails
);

module.exports = router;
