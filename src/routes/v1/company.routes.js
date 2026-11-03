const router = require('express').Router();
const CompanyController = require('../../controllers/company.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');
const {
	validationCreateCompany,
	validationUpdateCompany,
} = require('../../validations/Company.validator');
const { validate } = require('../../middlewares/validate');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	checkPermission('company', 'create'),
	validationCreateCompany,
	validate,
	CompanyController.createCompany,
);
router.put(
	'/:id',
	checkPermission('company', 'edit'),
	validationUpdateCompany,
	validate,
	CompanyController.updateCompany,
);
router.get('/', checkPermission('company', 'view'), CompanyController.getAllCompanies);
router.get('/:id', checkPermission('company', 'view'), CompanyController.getCompanyById);
router.delete('/:id', checkPermission('company', 'delete'), CompanyController.deleteCompany);

module.exports = router;