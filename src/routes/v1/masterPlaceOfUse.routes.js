const router = require('express').Router();
const MasterPlaceOfUseController = require('../../controllers/masterPlaceOfUse.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');


router.use(verifyToken);

router.post('/',checkPermission('place-of-use', 'create'), MasterPlaceOfUseController.createPlaceOfUse);
router.get('/', checkPermission('place-of-use', 'view'), MasterPlaceOfUseController.getAllPlaceOfUse);
router.get('/:id', checkPermission('place-of-use', 'view'), MasterPlaceOfUseController.getPlaceOfUseById);
router.put('/:id', checkPermission('place-of-use', 'edit'), MasterPlaceOfUseController.updatePlaceOfUse);
router.delete('/:id', checkPermission('place-of-use', 'delete'), MasterPlaceOfUseController.deletePlaceOfUse);

module.exports = router;