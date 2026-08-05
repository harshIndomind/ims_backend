const { sequelize } = require('../models/index');
const { QueryTypes } = require('sequelize');
const { getFiscalYear } = require('../utils/fiscalYear');

const SEQUENCE_WIDTH = 4;

// Atomic per-(org, doc_type, fiscal_year) counter. MySQL has no sequence object, so this uses
// the standard LAST_INSERT_ID(expr) upsert idiom: LAST_INSERT_ID() is connection/session-scoped,
// so reading it back right after is race-free under concurrent transactions without needing an
// explicit SELECT ... FOR UPDATE lock.
async function getNextSequenceNumber({ orgId, docType, fiscalYear, transaction }) {
	await sequelize.query(
		`INSERT INTO DocumentNumberSequences (org_id, doc_type, fiscal_year, last_number, createdAt, updatedAt)
		 VALUES (:orgId, :docType, :fiscalYear, LAST_INSERT_ID(1), NOW(), NOW())
		 ON DUPLICATE KEY UPDATE last_number = LAST_INSERT_ID(last_number + 1)`,
		{
			replacements: { orgId, docType, fiscalYear },
			transaction,
			type: QueryTypes.RAW,
		},
	);

	const [{ seq }] = await sequelize.query('SELECT LAST_INSERT_ID() AS seq', {
		transaction,
		type: QueryTypes.SELECT,
	});

	return Number(seq);
}

// Composes [DOC_TYPE]/[FISCAL_YEAR]/[UNIT_SHORT_CODE]/[MAJOR_HEAD_CODE]/[SEQ], e.g.
// "PO/2026-27/HQ/CAP/0001". Must be called inside the same transaction as the PO/WO row create
// so the reserved sequence number and the row commit succeed or fail together.
async function generateDocumentNumber({ orgId, docType, unitShortCode, majorHeadCode, transaction, date }) {
	const fiscalYear = getFiscalYear(date);
	const sequenceNo = await getNextSequenceNumber({ orgId, docType, fiscalYear, transaction });
	const docNumber = [docType, fiscalYear, unitShortCode, majorHeadCode, String(sequenceNo).padStart(SEQUENCE_WIDTH, '0')].join('/');

	return { docNumber, sequenceNo, fiscalYear };
}

module.exports = { generateDocumentNumber };
