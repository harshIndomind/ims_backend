const router = require('express').Router();
const OrganizationController = require('../../controllers/organization.controller');
const verifyToken = require('../../middlewares/verifyToken');
const { validate } = require('../../middlewares/validate');
const {
	validationCreateOrganization,
	validationUpdateOrganization,
} = require('../../validations/Organization.validator');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	checkPermission('organization', 'create'),
	validationCreateOrganization,
	validate,
	OrganizationController.createOrganization,
);
router.put(
	'/:id',
	checkPermission('organization', 'edit'),
	validationUpdateOrganization,
	validate,
	OrganizationController.updateOrganization,
);
router.delete(
	'/:id',
	checkPermission('organization', 'delete'),
	OrganizationController.deleteOrganization,
);
router.get(
	'/',
	checkPermission('organization', 'view'),
	OrganizationController.getAllOrganizations,
);
router.get(
	'/export',
	checkPermission('organization', 'export'),
	OrganizationController.exportOrganizations,
);
router.get(
	'/:id',
	checkPermission('organization', 'view'),
	OrganizationController.getOrganization,
);
router.get(
	'/organization/banks',
	checkPermission('organization', 'view'),
	OrganizationController.getOrganizationBankDetails,
);

module.exports = router;
