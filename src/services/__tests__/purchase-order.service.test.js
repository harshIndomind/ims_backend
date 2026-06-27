'use strict';

// purchase-order.service.js pulls in PDF/S3/gRPC machinery at module load time that has
// nothing to do with the qty_for_purchase_order logic under test — stub all of it so
// requiring the module here doesn't try to launch puppeteer, hit S3, or load real gRPC protos.
jest.mock('../../pdf/htmlPdfGenerator', () => ({
	generateInvoiceHTMLPDF: jest.fn(),
	generateInvoiceHTML: jest.fn(),
}));
jest.mock('../../utils/s3Bucket', () => ({
	generateSignedUrl: jest.fn(),
}));
jest.mock('../../grpc/clients/product.client', () => ({}));
jest.mock('../../grpc/clients/productUom.client', () => ({}));
jest.mock('undici', () => ({ fetch: jest.fn() }));

const mockTransaction = { commit: jest.fn(), rollback: jest.fn() };
jest.mock('../../models/index', () => ({
	sequelize: { transaction: jest.fn() },
	User: {},
	organization: {},
	PurchaseOrder: {},
	PurchaseOrderItem: {},
	Indent: {},
	Role: {},
	PaymentRequisition: { destroy: jest.fn() },
	MasterTermsCondition: {},
	MasterUnit: {},
}));

jest.mock('../../repository/index', () => ({
	purchaseOrderRepository: { create: jest.fn(), findById: jest.fn(), update: jest.fn() },
	purchaseOrderItemsRepository: { create: jest.fn(), findOne: jest.fn(), update: jest.fn() },
	purchaseOrderSerialItemsRepository: {},
	IndentItemRepository: { increment: jest.fn() },
}));

const { sequelize } = require('../../models/index');
const {
	purchaseOrderRepository: poRepo,
	purchaseOrderItemsRepository: poItemRepo,
	IndentItemRepository: indentItemRepo,
} = require('../../repository/index');
const poService = require('../purchase-order.service');

// qty_for_purchase_order is the live "still open for PO" balance — PO create/update/delete
// mutate it directly (this is unchanged from before this feature: see balance_indent_qty,
// which is a *separate* counter for post-receipt re-issue, not touched by PO actions at all).
function baseProductItem(overrides = {}) {
	return {
		product_id: 1,
		budget_id: 1,
		productSnapshot: { name: 'Widget' },
		budget_no: 'B-1',
		batch_id: null,
		qty: 6,
		qty_for_purchase_order: 10,
		price: 100,
		discount: 0,
		discount_price_type: 'percent',
		tax_id: 1,
		igst: 0,
		cgst: 0,
		sgst: 0,
		cess: 0,
		total: 600,
		stock_type: 'normal',
		note: '',
		selected_uom_id: null,
		specification: '',
		...overrides,
	};
}

beforeEach(() => {
	jest.clearAllMocks();
	sequelize.transaction.mockResolvedValue(mockTransaction);
});

describe('createPurchaseOrder — qty_for_purchase_order', () => {
	const reqBase = {
		user: { org_id: 1 },
		body: {
			indent_id: 5,
			purchaseOrderDetail: {},
			vendorInfo: {},
		},
	};

	it('rejects when PO qty exceeds the remaining qty_for_purchase_order', async () => {
		const req = { ...reqBase, body: { ...reqBase.body, productItems: [baseProductItem({ qty: 15, qty_for_purchase_order: 10 })] } };

		await expect(poService.createPurchaseOrder(req, req.body)).rejects.toThrow(/should not be greater than P\.O Order qty/);
		expect(poItemRepo.create).not.toHaveBeenCalled();
	});

	it('allows a partial PO within qty_for_purchase_order and decrements it by the PO qty', async () => {
		poRepo.create.mockResolvedValue({ id: 100 });
		poItemRepo.create.mockResolvedValue({ id: 200 });
		const req = { ...reqBase, body: { ...reqBase.body, productItems: [baseProductItem({ qty: 6, qty_for_purchase_order: 10 })] } };

		await poService.createPurchaseOrder(req, req.body);

		expect(indentItemRepo.increment).toHaveBeenCalledWith(
			{ qty_for_purchase_order: -6 },
			expect.objectContaining({ where: { indent_id: 5, product_id: 1 } }),
		);
		expect(mockTransaction.commit).toHaveBeenCalled();
	});

	it('allows a second partial PO that exactly drains the remaining balance to 0', async () => {
		poRepo.create.mockResolvedValue({ id: 101 });
		poItemRepo.create.mockResolvedValue({ id: 201 });
		// First PO already consumed 6 of an original 10 — caller now sends the live balance (4).
		const req = { ...reqBase, body: { ...reqBase.body, productItems: [baseProductItem({ qty: 4, qty_for_purchase_order: 4 })] } };

		await poService.createPurchaseOrder(req, req.body);

		expect(indentItemRepo.increment).toHaveBeenCalledWith(
			{ qty_for_purchase_order: -4 },
			expect.anything(),
		);
	});

	it('rejects any further PO once qty_for_purchase_order is 0', async () => {
		const req = { ...reqBase, body: { ...reqBase.body, productItems: [baseProductItem({ qty: 1, qty_for_purchase_order: 0 })] } };

		await expect(poService.createPurchaseOrder(req, req.body)).rejects.toThrow(/should not be greater than P\.O Order qty/);
	});

	it('never touches balance_indent_qty (that belongs to the re-issue flow, not PO creation)', async () => {
		poRepo.create.mockResolvedValue({ id: 102 });
		poItemRepo.create.mockResolvedValue({ id: 202 });
		const req = { ...reqBase, body: { ...reqBase.body, productItems: [baseProductItem({ qty: 6, qty_for_purchase_order: 10 })] } };

		await poService.createPurchaseOrder(req, req.body);

		for (const call of indentItemRepo.increment.mock.calls) {
			expect(call[0]).not.toHaveProperty('balance_indent_qty');
		}
	});
});

describe('updatePurchaseOrder — qty_for_purchase_order', () => {
	// Validation compares the new qty against the payload's qty_for_purchase_order (the value
	// currently in the DB, which does not yet include this same PO item's own qty being
	// restored), so the new qty here must be <= the pre-restore balance to pass validation.
	const req = {
		params: { id: 100 },
		body: {
			indent_id: 5,
			purchaseOrderDetail: {},
			vendorInfo: {},
			productItems: [baseProductItem({ qty: 4, qty_for_purchase_order: 4 })],
		},
	};

	it('restores the old PO item qty then decrements by the new qty (net delta)', async () => {
		poRepo.findById.mockResolvedValue({ id: 100 });
		poItemRepo.findOne.mockResolvedValue({ id: 200, qty: 6 });

		await poService.updatePurchaseOrder(req);

		expect(indentItemRepo.increment).toHaveBeenNthCalledWith(
			1,
			{ qty_for_purchase_order: 6 },
			expect.anything(),
		);
		expect(indentItemRepo.increment).toHaveBeenNthCalledWith(
			2,
			{ qty_for_purchase_order: -4 },
			expect.anything(),
		);
	});

	it('rejects when the new qty exceeds qty_for_purchase_order', async () => {
		const overReq = {
			...req,
			body: { ...req.body, productItems: [baseProductItem({ qty: 50, qty_for_purchase_order: 4 })] },
		};

		await expect(poService.updatePurchaseOrder(overReq)).rejects.toThrow(/should not be greater than P\.O Order qty/);
	});
});

describe('deletePurchaseOrder — qty_for_purchase_order', () => {
	it('restores qty_for_purchase_order by each deleted PO item qty', async () => {
		const { PaymentRequisition } = require('../../models/index');
		poRepo.findById.mockResolvedValue({
			indent_id: 5,
			items: [{ product_id: 1, qty: 6 }],
		});
		poRepo.delete = jest.fn();

		await poService.deletePurchaseOrder({ params: { id: 100 }, user: { org_id: 1, role: 'Admin' } });

		expect(indentItemRepo.increment).toHaveBeenCalledWith(
			{ qty_for_purchase_order: 6 },
			expect.objectContaining({ where: { indent_id: 5, product_id: 1 } }),
		);
		expect(PaymentRequisition.destroy).toHaveBeenCalled();
	});
});
