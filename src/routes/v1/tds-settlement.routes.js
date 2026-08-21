const router = require('express').Router();
const c = require('../../controllers/tds-settlement.controller');
const checkPermission = require('../../middlewares/checkPermission');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);

router.post('/', checkPermission('tds-settlement', 'create'), c.createTdsSettlement);
router.get('/', checkPermission('tds-settlement', 'view'), c.getAllTdsSettlements);
router.get('/:id', checkPermission('tds-settlement', 'view'), c.getTdsSettlementById);
router.post('/:id/reverse', checkPermission('tds-settlement', 'approver'), c.reverseTdsSettlement);

module.exports = router;
