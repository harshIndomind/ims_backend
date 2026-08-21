const router = require('express').Router();
const c = require('../../controllers/tds-liability.controller');
const checkPermission = require('../../middlewares/checkPermission');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);

router.get('/summary', checkPermission('tds-settlement', 'view'), c.getTdsSummary);
router.get('/', checkPermission('tds-settlement', 'view'), c.getAllTdsLiabilities);
router.get('/:id', checkPermission('tds-settlement', 'view'), c.getTdsLiabilityById);

module.exports = router;
