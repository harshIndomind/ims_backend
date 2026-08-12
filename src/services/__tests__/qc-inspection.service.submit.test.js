'use strict';

// Focused test for submitInspection's disposition-completeness gate — added per user request
// after QC #3/#4 on Surgical Gloves showed received qty (22) exceeding ordered qty (20) because
// QC #3 was allowed to submit/approve with 2 units received but never accepted or rejected.
jest.mock('../../utils/s3Bucket', () => ({ s3: {}, PutObjectCommand: jest.fn(), generateSignedUrl: jest.fn() }));

const mockQcInspection = { findOne: jest.fn() };
jest.mock('../../models/index', () => ({
	sequelize: { transaction: jest.fn() },
	PurchaseOrder: {},
	PurchaseOrderItem: {},
	WorkOrder: {},
	WorkOrderItem: {},
	OrderAcknowledgement: {},
	QcInspection: mockQcInspection,
	QcInspectionItem: {},
	QcResult: {},
	QcTemplate: {},
	QcTemplateItem: {},
	MasterQcRejectionReason: {},
	User: {},
}));

jest.mock('../../repository/index', () => ({
	qcInspectionRepository: {},
	qcInspectionItemsRepository: { sumAcceptedQtyForPoWoItem: jest.fn(), sumReceivedQtyForPoWoItem: jest.fn() },
	shortCloseRequestItemsRepository: { sumApprovedQtyForPoWoItem: jest.fn() },
	orderDocumentRepository: {},
}));

const mockTransaction = { commit: jest.fn(), rollback: jest.fn() };
const mockWorkflowEngine = { startInstance: jest.fn().mockResolvedValue({ status: 'in_progress' }) };
jest.mock('../workflowEngine.service', () => mockWorkflowEngine);
jest.mock('../auditLog.service', () => ({ record: jest.fn().mockResolvedValue(undefined) }));

const { sequelize, QcInspection } = require('../../models/index');
const qcInspectionService = require('../qc-inspection.service');

function inspectionWithItems(items, overrides = {}) {
	return {
		id: 4,
		org_id: 1,
		status: 'in_progress',
		template: null,
		items,
		update: jest.fn().mockResolvedValue(undefined),
		...overrides,
	};
}

beforeEach(() => {
	jest.resetAllMocks();
	sequelize.transaction.mockResolvedValue(mockTransaction);
	mockWorkflowEngine.startInstance.mockResolvedValue({ status: 'in_progress' });
});

describe('submitInspection — requires full disposition of received qty', () => {
	it('blocks submission when a line has received qty left unaccepted/unrejected', async () => {
		// Surgical Gloves: current_received_qty 10, accepted 8, rejected 0 → inspected 8, 2 left over.
		QcInspection.findOne.mockResolvedValue(
			inspectionWithItems([{ id: 1, result: 'passed', current_received_qty: 10, inspected_qty: 8 }]),
		);

		await expect(qcInspectionService.submitInspection({ user: { org_id: 1 } }, 4)).rejects.toThrow(
			/hasn't been fully accepted or rejected/,
		);
		expect(mockWorkflowEngine.startInstance).not.toHaveBeenCalled();
	});

	it('allows submission once every line is fully dispositioned', async () => {
		const inspection = inspectionWithItems([
			{ id: 1, result: 'passed', current_received_qty: 10, inspected_qty: 10 },
			{ id: 2, result: 'partial', current_received_qty: 5, inspected_qty: 5 },
		]);
		QcInspection.findOne.mockResolvedValueOnce(inspection).mockResolvedValueOnce(inspection);

		await qcInspectionService.submitInspection({ user: { org_id: 1 } }, 4);

		expect(mockWorkflowEngine.startInstance).toHaveBeenCalled();
		expect(inspection.update).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'completed' }),
			expect.any(Object),
		);
		expect(mockTransaction.commit).toHaveBeenCalled();
	});

	it('still blocks when a line that DID receive something was never dispositioned', async () => {
		QcInspection.findOne.mockResolvedValue(
			inspectionWithItems([{ id: 1, result: 'pending', current_received_qty: 10, inspected_qty: 0 }]),
		);

		await expect(qcInspectionService.submitInspection({ user: { org_id: 1 } }, 4)).rejects.toThrow(
			/no recorded result/,
		);
	});

	it('blocks submission when nothing was received across every line (empty inspection)', async () => {
		QcInspection.findOne.mockResolvedValue(
			inspectionWithItems([
				{ id: 1, result: 'pending', current_received_qty: 0, inspected_qty: 0 },
				{ id: 2, result: 'pending', current_received_qty: 0, inspected_qty: 0 },
			]),
		);

		await expect(qcInspectionService.submitInspection({ user: { org_id: 1 } }, 4)).rejects.toThrow(
			/Nothing has been received/,
		);
	});

	it('allows submission when one line was received+dispositioned and a sibling line on the same PO simply had nothing arrive this round', async () => {
		// This is the exact scenario reported: 2 items on one inspection, only 1 arrived in this
		// delivery. The untouched line (0 received, still 'pending') must NOT block submission.
		const inspection = inspectionWithItems([
			{ id: 1, result: 'passed', current_received_qty: 10, inspected_qty: 10 },
			{ id: 2, result: 'pending', current_received_qty: 0, inspected_qty: 0 },
		]);
		QcInspection.findOne.mockResolvedValueOnce(inspection).mockResolvedValueOnce(inspection);

		await qcInspectionService.submitInspection({ user: { org_id: 1 } }, 4);

		expect(mockWorkflowEngine.startInstance).toHaveBeenCalled();
		expect(inspection.update).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'completed' }),
			expect.any(Object),
		);
	});
});
