const router = require('express').Router();
const OrganizationController = require('../../controllers/service-organization.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');
const { validate } = require('../../middlewares/validate');
const {
	validationCreateOrganization,
	validationUpdateOrganization,
} = require('../../validations/Organization.validator');
const verifyServiceToken = require('../../middlewares/verifyServiceToken');

// router.use(verifyToken);

router.post(
	'/',
	verifyServiceToken,
	validationCreateOrganization,
	validate,
	OrganizationController.createOrganization
);
router.put(
	'/:id',
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
	'/export',
	checkRole(['Super Admin', 'Admin']),
	OrganizationController.exportOrganizations
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
