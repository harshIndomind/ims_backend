const router = require('express').Router();
const PartnersController = require('../../controllers/partners.controller');
const verifyToken = require('../../middlewares/verifyToken');
const { validate } = require('../../middlewares/validate');
const {
	validationCreateVendor,
	validationUpdateVendor,
} = require('../../validations/Vendor.validator');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	validationCreateVendor,
	validate,
	PartnersController.createPartner
);
router.get('/export', PartnersController.exportPartners);
router.patch('/can-login/:id', PartnersController.updateVendorCanLogin);
router.get('/organization/:org_id', PartnersController.getOrganizationVendors);
router.put(
	'/:id',
	validationUpdateVendor,
	validate,
	PartnersController.updatePartner
);
router.delete('/:id', PartnersController.deletePartner);
router.get('/', PartnersController.getAllPartners);
router.get('/:id', PartnersController.getPartnerById);
router.put('/add-shipping-address/:id', PartnersController.addShippingAddress);
router.get(
	'/shipping-address/:id',
	PartnersController.getShippingAddressesByPartnerId
);
module.exports = router;
