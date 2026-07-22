const router = require('express').Router();
const OrganizationController = require('../../controllers/service-organization.controller');
const verifyToken = require('../../middlewares/verifyToken');
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
	OrganizationController.deleteOrganization
);
router.get(
	'/',
	OrganizationController.getAllOrganizations
);
router.get(
	'/export',
	OrganizationController.exportOrganizations
);
router.get(
	'/:id',
	OrganizationController.getOrganization
);
router.get(
	'/organization/banks',
	OrganizationController.getOrganizationBankDetails
);

module.exports = router;
