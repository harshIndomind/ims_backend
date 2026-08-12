'use strict';

// Focused test for getRemainingForDocument's short-close integration only — this is the one
// shared formula both the QC-creation gate (here) and the Short-Close-creation gate
// (short-close.service.js) depend on; see short-close-implementation-plan.md §7.
jest.mock('../../utils/s3Bucket', () => ({ s3: {}, PutObjectCommand: jest.fn(), generateSignedUrl: jest.fn() }));

const mockPurchaseOrder = { findOne: jest.fn() };
const mockQcInspection = { findOne: jest.fn() };

jest.mock('../../models/index', () => ({
	sequelize: { transaction: jest.fn() },
	PurchaseOrder: mockPurchaseOrder,
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

const mockSumAccepted = jest.fn();
const mockSumReceived = jest.fn();
const mockSumApprovedShortClose = jest.fn();
jest.mock('../../repository/index', () => ({
	qcInspectionRepository: {},
	qcInspectionItemsRepository: {
		sumAcceptedQtyForPoWoItem: mockSumAccepted,
		sumReceivedQtyForPoWoItem: mockSumReceived,
	},
	shortCloseRequestItemsRepository: { sumApprovedQtyForPoWoItem: mockSumApprovedShortClose },
	orderDocumentRepository: {},
}));

jest.mock('../workflowEngine.service', () => ({}));
jest.mock('../auditLog.service', () => ({ record: jest.fn() }));

const { PurchaseOrder, QcInspection } = require('../../models/index');
const qcInspectionService = require('../qc-inspection.service');

function poWithItem(overrides = {}) {
	return {
		id: 50,
		po_qc_check: true,
		items: [{ id: 200, product_id: 1, productSnapshot: { name: 'Cement' }, qty: 100 }],
		...overrides,
	};
}

beforeEach(() => {
	jest.resetAllMocks();
});

describe('getRemainingForDocument — nets out approved short-close qty', () => {
	it('subtracts short-closed qty from remaining and marks the line SHORT_CLOSED once fully settled', async () => {
		PurchaseOrder.findOne.mockResolvedValue(poWithItem());
		QcInspection.findOne.mockResolvedValue(null);
		mockSumAccepted.mockResolvedValue(70);
		mockSumReceived.mockResolvedValue(70);
		mockSumApprovedShortClose.mockResolvedValue(30);

		const result = await qcInspectionService.getRemainingForDocument(
			{ user: { org_id: 1 } },
			{ document_type: 'purchase_order', document_id: 50 },
		);

		expect(result.items[0]).toEqual(
			expect.objectContaining({
				ordered_qty: 100,
				accepted_qty: 70,
				short_closed_qty: 30,
				remaining_qty: 0,
				line_status: 'SHORT_CLOSED',
			}),
		);
		// Fully settled via short close — QC must not offer a new inspection for this line.
		expect(result.can_create_inspection).toBe(false);
	});

	it('still allows a new inspection on the still-open remainder of a partially short-closed line', async () => {
		PurchaseOrder.findOne.mockResolvedValue(poWithItem());
		QcInspection.findOne.mockResolvedValue(null);
		mockSumAccepted.mockResolvedValue(70);
		mockSumReceived.mockResolvedValue(70);
		mockSumApprovedShortClose.mockResolvedValue(10); // only part of the remainder short-closed

		const result = await qcInspectionService.getRemainingForDocument(
			{ user: { org_id: 1 } },
			{ document_type: 'purchase_order', document_id: 50 },
		);

		expect(result.items[0]).toEqual(
			expect.objectContaining({ remaining_qty: 20, line_status: 'PARTIALLY_FULFILLED' }),
		);
		expect(result.can_create_inspection).toBe(true);
	});

	it('marks a line FULFILLED (not SHORT_CLOSED) when it was completed by acceptance alone', async () => {
		PurchaseOrder.findOne.mockResolvedValue(poWithItem());
		QcInspection.findOne.mockResolvedValue(null);
		mockSumAccepted.mockResolvedValue(100);
		mockSumReceived.mockResolvedValue(100);
		mockSumApprovedShortClose.mockResolvedValue(0);

		const result = await qcInspectionService.getRemainingForDocument(
			{ user: { org_id: 1 } },
			{ document_type: 'purchase_order', document_id: 50 },
		);

		expect(result.items[0]).toEqual(expect.objectContaining({ remaining_qty: 0, line_status: 'FULFILLED' }));
	});
});
