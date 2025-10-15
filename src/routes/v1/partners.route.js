const router = require('express').Router();
const PartnersController = require('../../controllers/partners.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');

router.use(verifyToken); // all routes protected

router.post('/', PartnersController.createPartner);
router.put('/:id', PartnersController.updatePartner);
router.delete('/:id', PartnersController.deletePartner);
router.get('/', PartnersController.getAllPartners);
router.get('/:id', PartnersController.getPartnerById);

module.exports = router;
