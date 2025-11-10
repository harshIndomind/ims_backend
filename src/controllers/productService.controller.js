const {
	Product,
	ProductBatch,
	ProductSerial,
	Tax,
	Unit,
	ProductGroup,
	ProductUOM,
	sequelize,
	organization,
} = require('../models');
const AppError = require('../utils/AppError');
const {
	s3,
	PutObjectCommand,
	DeleteObjectCommand,
	generateSignedUrl,
} = require('../utils/s3Bucket');
const uomMap = require('../utils/uomConversionMap');

// Create Product
exports.createProduct = async (req, res) => {
	const t = await sequelize.transaction();
	try {
		const { org_id } = req.user;

		const orgData = await organization.findOne({ where: { id: org_id } });
		console.log('orgData ', orgData);

		if (!orgData) {
			return res
				.status(404)
				.json({ message: 'Organization details not found.' });
		}

		const data = req.body;

		// Parse JSON if coming from multipart/form-data
		if (typeof data.batchDetails === 'string') {
			try {
				data.batchDetails = JSON.parse(data.batchDetails);
			} catch (e) {
				return res.status(400).json({ message: 'Invalid batchDetails JSON' });
			}
		}
		if (typeof data.productSerials === 'string') {
			data.productSerials = JSON.parse(data.productSerials);
		}

		if (typeof data.uom === 'string') {
			data.uom = JSON.parse(data.uom);
		}
		console.log('====================Start Create Product====================');
		console.log('createProduct => ', data);
		console.log('====================End Create Product====================');
		// return
		if (req.files && req.files.length > 0) {
			const uploadedFiles = [];

			for (const file of req.files) {
				const folderName = 'vcp_product_services_images'; // or your desired folder
				const generated_filename = `${Date.now()}_${file.originalname}`;
				const fullPath = `${folderName}/${generated_filename}`;

				const uploadParams = {
					Bucket: process.env.AWS_BUCKET_NAME,
					Key: fullPath,
					Body: file.buffer,
					ContentType: file.mimetype,
				};

				await s3.send(new PutObjectCommand(uploadParams));

				uploadedFiles.push(fullPath);
			}
			console.log('uploadedFiles ', uploadedFiles);

			data.product_images = uploadedFiles.join(',');
		}

		// Remove unwanted batchDetails when not needed
		if (data.stock_type !== 'batch') delete data.batchDetails;
		if (data.stock_type !== 'serial') delete data.serial_no;
		if (data.stock_type == 'batch') {
			delete data.available_qty;
			delete data.sell_price;
			delete data.sell_price_incl_tax;
			delete data.purchase_price_incl_tax;
		}

		let normalPricing = {};

		if (data.stock_type === 'normal') {
			normalPricing = {
				available_qty:
					data.available_qty && data.available_qty !== ''
						? data.available_qty
						: null,
				sell_price: data.sell_price ?? null,
				sell_price_incl_tax: data.sell_price_incl_tax ?? null,
				purchase_price:
					data.purchase_price && data.purchase_price !== ''
						? data.purchase_price
						: null,
				purchase_price_incl_tax:
					data.purchase_price_incl_tax && data.purchase_price_incl_tax !== ''
						? data.purchase_price_incl_tax
						: null,
			};
		}

		const latestProduct = await Product.findOne({
			where: {
				organization_id: org_id,
			},
			order: [['createdAt', 'DESC']],
		});

		let newProductNumber = 1;
		if (latestProduct) {
			const unqProductNo = latestProduct.uniqueProductId.split('/')[2];
			const latestNumber = parseInt(unqProductNo, 10);
			if (!isNaN(latestNumber)) {
				newProductNumber = latestNumber + 1;
			}
		}

		const paddedString = newProductNumber.toString().padStart(6, 0);

		const itemType = data.item_type.toUpperCase().substr(0, 3);
		const date = new Date();
		const currentYear = date.getFullYear();
		const uniqueProductServiceId = `${itemType}/${orgData.org_code}/${paddedString}`;

		const isExists = await Product.findOne({
			where: { uniqueProductId: uniqueProductServiceId },
		});

		if (isExists) {
			throw new AppError('Duplicate unique product id.', 400);
			return;
		}

		// const relatedUOMs = getAutoRelatedUOMs(unit.code);
		// const finalUOMList = [
		// 	// { code: baseUnitCode, factor: 1 },
		// 	...dbUOMs,
		// 	...getAutoRelatedUOMs(unit.code),
		// ];
		// console.log('finalUOMList => ', finalUOMList);
		// return;
		// Create main product
		const product = await Product.create(
			{
				organization_id: org_id,
				item_type: data.item_type ?? null,
				name: data.name ?? null,
				uniqueProductId: uniqueProductServiceId,
				product_note: data.product_note ?? null,
				barcode_no: data.barcode_no ?? null,
				hsn_sac_code: data.hsn_sac_code ?? null,
				unit_id: data.unit_id || null,
				tax_id: data.tax_id ?? null,
				cess_percent:
					data.cess_percent && data.cess_percent !== ''
						? data.cess_percent
						: null,
				cess_amount:
					data.cess_amount && data.cess_amount !== '' ? data.cess_amount : null,
				cess_type: data.cess_type || null,
				no_itc: data.no_itc ?? null,
				stock_type: data.stock_type,
				...normalPricing,
				low_stock_alert:
					data.low_stock_alert && data.low_stock_alert !== ''
						? data.low_stock_alert
						: null,
				product_discount: data.product_discount || null,
				product_discount_type: data.product_discount_type || null,
				is_manufactured: data.is_manufactured ?? null,
				is_non_sellable: data.is_non_sellable ?? null,
				is_enabled: data.is_enabled ?? null,
				product_images: data.product_images || null,
			},
			{ transaction: t }
		);

		// Create batch/serial records if applicable
		if (data.stock_type === 'batch' && data.batchDetails?.length) {
			for (const batch of data.batchDetails) {
				delete batch.id;
				await ProductBatch.create(
					{
						product_id: product.id,
						...batch,
						qty: batch.qty && batch.qty !== '' ? batch.qty : null,
						sell_price: batch.sell_price ?? null,
						sell_price_incl_tax: batch.sell_price_incl_tax ?? null,
						purchase_price:
							batch.purchase_price && batch.purchase_price !== ''
								? batch.purchase_price
								: null,
						purchase_price_incl_tax:
							batch.purchase_price_incl_tax &&
							batch.purchase_price_incl_tax !== ''
								? batch.purchase_price_incl_tax
								: null,
					},
					{ transaction: t }
				);
			}
		}

		if (data.stock_type === 'serial') {
			const serials = data.productSerials.serial_no.split(',');

			if (serials?.length > 0) {
				for (const serial of serials) {
					await ProductSerial.create(
						{
							product_id: product.id,
							serial_no: serial.trim(),
							sell_price: data.productSerials.sell_price ?? 0,
							sell_price_incl_tax: data.productSerials.sell_price_incl_tax ?? 0,
							purchase_price: data.productSerials.purchase_price || null,
							purchase_price_incl_tax:
								data.productSerials.purchase_price_incl_tax || null,
						},
						{ transaction: t }
					);
				}
			}
		}

		if (data.product_group_id && data.product_group_id != '') {
			await product.setProduct_groups(data.product_group_id.split(','), {
				transaction: t,
			});
		}

		if (data.uom && data.uom.length > 0) {
			const validUOMs = data.uom.filter(
				(u) => u.unit_id && u.qty && u.unit_id !== '' && u.qty !== ''
			);

			if (validUOMs.length > 6) {
				return res.status(400).json({
					message: 'You can only add up to 6 UOM conversions.',
				});
			}

			if (data.unit_id) {
				const unit = await Unit.findOne({ where: { id: data.unit_id } });

				if (unit?.id) {
					validUOMs.push({ unit_id: data.unit_id, qty: 1 });
				}
			}

			await Promise.all(
				validUOMs.map((u) =>
					ProductUOM.create(
						{
							product_id: product.id,
							unit_id: u.unit_id,
							qty: u.qty,
						},
						{ transaction: t }
					)
				)
			);
		}

		await t.commit();

		res.status(201).json({ message: 'Product created successfully', product });
	} catch (err) {
		await t.rollback();
		console.error(err);
		res
			.status(500)
			.json({ message: 'Error creating product', error: err.message });
	}
};

// Get All Products
exports.getAllProducts = async (req, res) => {
	try {
		const products = await Product.findAll({
			include: [
				{ model: Tax, as: 'tax', attributes: ['id', 'name', 'rate'] },
				{ model: Unit, as: 'unit', attributes: ['id', 'name', 'code'] },
				{
					model: ProductGroup,
					as: 'product_groups',
					attributes: ['id', 'name'],
				},
				{ model: ProductBatch, as: 'batches' },
				{
					model: ProductSerial,
					as: 'serials',
					where: { is_sell: 0 },
					required: false,
				},
				{
					model: ProductUOM,
					as: 'uoms',
					include: {
						model: Unit,
						as: 'unit',
						attributes: ['code', 'name'],
					},
				},
			],
			order: [['id', 'DESC']],
		});
		res.json(products);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

// Get Product by ID
exports.getProductById = async (req, res) => {
	try {
		const product = await Product.findByPk(req.params.id, {
			include: [
				// { model: Tax, as: 'tax' },
				// { model: Unit, as: 'unit' },
				{ model: ProductUOM, as: 'uoms', attributes: ['unit_id', 'qty'] },
				{ model: ProductGroup, as: 'product_groups' },
				{
					model: ProductBatch,
					as: 'batches',
				},
				{
					model: ProductSerial,
					as: 'serials',
					where: { is_sell: 0 },
					required: false,
				},
			],
		});

		if (!product) return res.status(404).json({ message: 'Product not found' });

		// Convert Sequelize instance to plain object
		const productData = product.get({ plain: true });

		const signedImages = [];
		if (productData.product_images) {
			const images = productData.product_images.split(',');
			for (const image of images) {
				const signedURL = await generateSignedUrl(image);
				signedImages.push(signedURL);
			}
		}

		productData.images = signedImages;
		productData.product_group_id =
			productData.product_groups.map((g) => g.id).join(',') ?? '';

		res.json({ message: 'Product fetched successfully', data: productData });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

// Update Product
exports.updateProduct = async (req, res) => {
	const t = await sequelize.transaction();
	try {
		const productId = req.params.id;
		const data = req.body;

		// Parse JSON if coming from multipart/form-data
		if (typeof data.batchDetails === 'string') {
			try {
				data.batchDetails = JSON.parse(data.batchDetails);
			} catch (e) {
				return res.status(400).json({ message: 'Invalid batchDetails JSON' });
			}
		}
		if (typeof data.productSerials === 'string') {
			data.productSerials = JSON.parse(data.productSerials);
		}

		if (typeof data.uom === 'string') {
			data.uom = JSON.parse(data.uom);
		}

		console.log('====================Start Update Product====================');
		console.log('updateProduct => ', data);
		console.log('====================End Update Product====================');

		// Handle file uploads if any
		if (req.files && req.files.length > 0) {
			const uploadedFiles = [];
			for (const file of req.files) {
				const folderName = 'vcp_product_services_images';
				const generated_filename = `${Date.now()}_${file.originalname}`;
				const fullPath = `${folderName}/${generated_filename}`;

				const uploadParams = {
					Bucket: process.env.AWS_BUCKET_NAME,
					Key: fullPath,
					Body: file.buffer,
					ContentType: file.mimetype,
				};

				await s3.send(new PutObjectCommand(uploadParams));
				uploadedFiles.push(fullPath);
			}
			data.product_images = uploadedFiles.join(',');
		}

		// Remove unnecessary fields based on stock_type
		if (data.stock_type !== 'batch') delete data.batchDetails;
		if (data.stock_type !== 'serial') delete data.serial_no;
		if (data.stock_type === 'batch') {
			delete data.available_qty;
			delete data.sell_price;
			delete data.sell_price_incl_tax;
			delete data.purchase_price;
			delete data.purchase_price_incl_tax;
		}

		let normalPricing = {};
		if (data.stock_type === 'normal') {
			normalPricing = {
				available_qty:
					data.available_qty && data.available_qty !== ''
						? data.available_qty
						: null,
				sell_price: data.sell_price ?? null,
				sell_price_incl_tax: data.sell_price_incl_tax ?? null,
				purchase_price:
					data.purchase_price && data.purchase_price !== ''
						? data.purchase_price
						: null,
				purchase_price_incl_tax:
					data.purchase_price_incl_tax && data.purchase_price_incl_tax !== ''
						? data.purchase_price_incl_tax
						: null,
			};
		}

		// Update main product
		const product = await Product.findByPk(productId);
		if (!product) return res.status(404).json({ message: 'Product not found' });
		console.log('data ', data);

		const productUpdated = await product.update(
			{
				item_type: data.item_type ?? product.item_type,
				name: data.name ?? product.name,
				product_note: data.product_note ?? product.product_note,
				barcode_no: data.barcode_no ?? product.barcode_no,
				hsn_sac_code: data.hsn_sac_code ?? product.hsn_sac_code,
				unit_id: data.unit_id || null,
				tax_id: data.tax_id ?? product.tax_id,
				cess_percent:
					data.cess_percent && data.cess_percent !== ''
						? data.cess_percent
						: null,
				cess_amount:
					data.cess_amount && data.cess_amount !== '' ? data.cess_amount : null,
				cess_type: data.cess_type ?? product.cess_type,
				no_itc: data.no_itc ?? product.no_itc,
				stock_type: data.stock_type ?? product.stock_type,
				...normalPricing,
				low_stock_alert:
					data.low_stock_alert && data.low_stock_alert !== ''
						? data.low_stock_alert
						: null,
				product_discount:
					data.product_discount && data.product_discount !== ''
						? data.product_discount
						: null,
				product_discount_type:
					data.product_discount_type ?? product.product_discount_type,
				is_manufactured: data.is_manufactured ?? product.is_manufactured,
				is_non_sellable: data.is_non_sellable ?? product.is_non_sellable,
				is_enabled: data.is_enabled ?? product.is_enabled,
				product_images: data.product_images ?? product.product_images,
			},
			{ transaction: t }
		);

		// Update batch records
		if (data.stock_type === 'batch' && data.batchDetails?.length) {
			// Delete old batches first
			// await ProductBatch.destroy({ where: { product_id: productId } });

			// for (const batch of data.batchDetails) {
			// 	await ProductBatch.create({
			// 		product_id: productId,
			// 		...batch,
			// 	});
			// }

			for (const batch of data.batchDetails) {
				if (batch.id) {
					await ProductBatch.update(
						{
							batch_no: batch.batch_no,
							qty: batch.qty,
							sell_price: batch.sell_price,
							sell_price_incl_tax: batch.sell_price_incl_tax,
							purchase_price: batch.purchase_price ?? null,
							purchase_price_incl_tax: batch.purchase_price_incl_tax ?? null,
							barcode_no: batch.barcode_no,
						},
						{ where: { id: batch.id, product_id: productId }, transaction: t }
					);
				} else {
					// new batch → create
					await ProductBatch.create(
						{ product_id: productId, ...batch },
						{ transaction: t }
					);
				}
			}
		}

		// Update serial records
		if (data.stock_type === 'serial' && data.productSerials?.serial_no) {
			const serials = data.productSerials.serial_no.split(',');

			// Delete old serials first
			await ProductSerial.destroy({ where: { product_id: productId } });

			for (const serial of serials) {
				await ProductSerial.create(
					{
						product_id: productId,
						serial_no: serial.trim(),
						sell_price: data.productSerials.sell_price ?? 0,
						sell_price_incl_tax: data.productSerials.sell_price_incl_tax ?? 0,
						purchase_price: data.productSerials.purchase_price ?? 0,
						purchase_price_incl_tax:
							data.productSerials.purchase_price_incl_tax ?? 0,
					},
					{ transaction: t }
				);
			}
		}

		if (data.product_group_id && data.product_group_id != '') {
			await productUpdated.setProduct_groups(data.product_group_id.split(','), {
				transaction: t,
			});
		}

		if (data.uom && data.uom.length > 0) {
			const validUOMs = data.uom.filter(
				(u) => u.unit_id && u.qty && u.unit_id !== '' && u.qty !== ''
			);

			if (validUOMs.length > 6) {
				return res.status(400).json({
					message: 'You can only add up to 6 UOM conversions.',
				});
			}

			// if (data.unit_id) {
			// 	const unit = await Unit.findOne({ where: { id: data.unit_id } });

			// 	if (unit?.id) {
			// 		validUOMs.unshift({ unit_id: data.unit_id, qty: 1 });
			// 	}
			// }

			await ProductUOM.destroy(
				{ where: { product_id: productUpdated.id } },
				{ transaction: t }
			);
			console.log('validUOMs ', validUOMs);

			await Promise.all(
				validUOMs.map((u) =>
					ProductUOM.create(
						{
							product_id: productUpdated.id,
							unit_id: u.unit_id,
							qty: u.qty,
						},
						{ transaction: t }
					)
				)
			);
		} else {
			await ProductUOM.destroy(
				{ where: { product_id: productUpdated.id } },
				{ transaction: t }
			);
		}

		await t.commit();
		res.status(200).json({ message: 'Product updated successfully', product });
	} catch (err) {
		await t.rollback();
		console.error(err);
		res
			.status(500)
			.json({ message: 'Error updating product', error: err.message });
	}
};

// Delete Product (soft delete)
exports.deleteProduct = async (req, res) => {
	try {
		const product = await Product.findByPk(req.params.id);
		if (!product) {
			return res.status(404).json({ message: 'Product not found' });
		}

		if (product.product_images) {
			const imagePaths = product.product_images.split(',');

			for (const path of imagePaths) {
				const deleteParams = {
					Bucket: process.env.AWS_BUCKET_NAME,
					Key: path.trim(), // full S3 key path
				};

				try {
					await s3.send(new DeleteObjectCommand(deleteParams));
					console.log(`Deleted from S3: ${path}`);
				} catch (err) {
					console.error(`Failed to delete ${path} from S3:`, err.message);
				}
			}
		}

		await product.destroy({ where: { id: req.params.id } });
		await ProductUOM.destroy({ where: { product_id: req.params.id } });
		await ProductSerial.destroy({ where: { product_id: req.params.id } });
		await ProductBatch.destroy({ where: { product_id: req.params.id } });

		res.json({
			message: 'Product disabled and images deleted from S3 successfully',
		});
	} catch (err) {
		console.error('Delete Product Error:', err);
		res
			.status(500)
			.json({ message: 'Failed to delete product', error: err.message });
	}
};

function getAutoRelatedUOMs(baseCode) {
	const related = [];

	if (uomMap[baseCode]) {
		for (const [code, factor] of Object.entries(uomMap[baseCode])) {
			related.push({ code, factor });
		}
	}

	// Also reverse lookup (e.g., if TON refers to KGS)
	//   for (const [key, val] of Object.entries(uomMap)) {
	//     if (val[baseCode]) {
	//       related.push({ code: key, factor: 1 / val[baseCode] });
	//     }
	//   }

	return related;
}
