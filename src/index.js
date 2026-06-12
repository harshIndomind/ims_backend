const express = require('express');
const app = express();
const { PORT, BASE_URL, APP_ENV, CORS_WHITELIST } = require('./config/serverConfig');
const cors = require('cors');
const authRoutes = require('./routes/v1/auth.routes');
const db = require('./models/index');
const cookieParser = require('cookie-parser');
const errorHandler = require('./middlewares/errorHandler');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { sendTestMail } = require('./utils/mailer');
app.use('/uploads', express.static(path.join(__dirname, '/uploads')));
const http = require('http');
const { init } = require('./utils/socket');
// const publishMessage = require('./publisher/publisher');
// const { connectQueue } = require('./shared/rabbitmq');
// const {consumeAdminEvents} = require('./shared/consumeEvent');
const { connect } = require('./config/rabbitmq');
const { startConsumer } = require('./events/consumer');
const helmet = require('helmet');

const limiter = rateLimit({
	windowMs: 1 * 60 * 1000,
	limit: 100,
	standardHeaders: 'draft-8',
	legacyHeaders: false,
});

const authLimiter = rateLimit({
	windowMs: 5 * 60 * 1000,
	limit: 5,
	standardHeaders: 'draft-8',
	legacyHeaders: false,
});

async function prepareAndStartServer() {
	// sendTestMail();
	console.log(`Environment: ${APP_ENV}`);
	console.log(`PORT: ${PORT}`);
	console.log(`Server listening on ${BASE_URL}`);
	console.log(`Date ${new Date().toString()}`);

	app.use(helmet());
	app.use(cookieParser());
	const whitelist = CORS_WHITELIST;

	app.use(
		cors({
			origin: function (origin, callback) {
				if (whitelist.includes(origin) || !origin) {
					callback(null, true);
				} else {
					console.error(`Blocked by CORS: ${origin}`);
					callback(new Error('Not allowed by CORS'));
				}
			},
			credentials: true,
		}),
	);
	app.use(express.json({ limit: '10mb' }));
	app.use(express.urlencoded({ extended: true, limit: '10mb' }));

	// app.use(limiter);

	const apiPrefix = APP_ENV === 'production' ? '' : '/api';
	console.log('apiPrefix ', apiPrefix);

	app.use('/storage', express.static(path.join(__dirname, '../storage')));

	app.use(`${apiPrefix}/v1/auth`, authRoutes);
	app.use(`${apiPrefix}/v1/users`, require('./routes/v1/user.routes'));
	app.use(
		`${apiPrefix}/v1/user-roles`,
		require('./routes/v1/user-roles.routes'),
	);

	app.use(`${apiPrefix}/v1/dashboard`, require('./routes/v1/dashboard.routes'));
	app.use(
		`${apiPrefix}/v1/organizations`,
		require('./routes/v1/organization.route'),
	);
	// app.use(
	// 	`${apiPrefix}/v1/docs-categories`,
	// 	require('./routes/v1/docs-category.route')
	// );
	// app.use(
	// 	`${apiPrefix}/v1/docs-uploads`,
	// 	require('./routes/v1/doc-uploads.routes')
	// );
	app.use(`${apiPrefix}/v1/roles`, require('./routes/v1/role.routes'));
	app.use(`${apiPrefix}/v1/menus`, require('./routes/v1/menu.routes'));
	app.use(
		`${apiPrefix}/v1/permissions`,
		require('./routes/v1/permission.routes'),
	);
	app.use(
		`${apiPrefix}/v1/role-permissions`,
		require('./routes/v1/roles-permission.routes'),
	);
	app.use(
		`${apiPrefix}/v1/notifications`,
		require('./routes/v1/notifications.routes'),
	);
	// app.use(`${apiPrefix}/v1/partners`, require('./routes/v1/partners.route'));
	// app.use(
	// 	`${apiPrefix}/v1/product-groups`,
	// 	require('./routes/v1/product-group.route')
	// );
	// app.use(`${apiPrefix}/v1/taxes`, require('./routes/v1/tax.routes'));
	// app.use(`${apiPrefix}/v1/units`, require('./routes/v1/unit.routes'));
	app.use(`${apiPrefix}/v1/countries`, require('./routes/v1/country.routes'));
	app.use(`${apiPrefix}/v1/states`, require('./routes/v1/state.routes'));
	// app.use(
	// 	`${apiPrefix}/v1/product-services`,
	// 	require('./routes/v1/productService.route')
	// );
	// app.use(`${apiPrefix}/v1/invoices`, require('./routes/v1/invoice.routes'));
	// app.use(`${apiPrefix}/v1/reports`, require('./routes/v1/reports.routes'));
	// app.use(`${apiPrefix}/v1/registration-types`, require('./routes/v1/registration-types.routes'));
	// app.use(`${apiPrefix}/v1/credit-note`, require('./routes/v1/credit-note-invoice.routes'));

	// Budget Planner
	app.use(
		`${apiPrefix}/v1/master/major-head`,
		require('./routes/v1/masterMajorHead.routes'),
	);
	app.use(
		`${apiPrefix}/v1/master/sub-head`,
		require('./routes/v1/masterSubHead.routes'),
	);
	app.use(
		`${apiPrefix}/v1/master/period`,
		require('./routes/v1/masterPeriod.routes'),
	);
	app.use(
		`${apiPrefix}/v1/master/major-head-amount`,
		require('./routes/v1/masterMajorHeadAmount.routes'),
	);
	app.use(
		`${apiPrefix}/v1/master/sub-head-amount`,
		require('./routes/v1/masterSubHeadAmount.routes'),
	);
	app.use(
		`${apiPrefix}/v1/master/budget`,
		require('./routes/v1/budget.routes'),
	);
	app.use(
		`${apiPrefix}/v1/master/cost-center`,
		require('./routes/v1/costCenter.routes'),
	);
	app.use(
		`${apiPrefix}/v1/master/accounts`,
		require('./routes/v1/masterAccounts.routes'),
	);
	app.use(
		`${apiPrefix}/v1/master/terms`,
		require('./routes/v1/masterTerms.routes'),
	);
	app.use(
		`${apiPrefix}/v1/master/transporter`,
		require('./routes/v1/masterTransporter.routes'),
	);
	app.use(
		`${apiPrefix}/v1/master/units`,
		require('./routes/v1/masterUnit.routes'),
	);

	app.use(
		`${apiPrefix}/v1/departments`,
		require('./routes/v1/department.routes'),
	);
	app.use(
		`${apiPrefix}/v1/designations`,
		require('./routes/v1/designation.routes'),
	);
	// API'S FOR OTHER SERVICES
	app.use(
		`${apiPrefix}/v1/service/organizations`,
		require('./routes/v1/service-organization.route'),
	);
	app.use(
		`${apiPrefix}/v1/service/users`,
		require('./routes/v1/service-user.routes'),
	);
	app.use(
		`${apiPrefix}/v1/admin-users`,
		require('./routes/v1/admin-user.routes'),
	);
	app.use(`${apiPrefix}/v1/indent`, require('./routes/v1/indent.routes'));
	app.use(
		`${apiPrefix}/v1/rate-contract`,
		require('./routes/v1/rate-contract.routes'),
	);
	app.use(
		`${apiPrefix}/v1/purchase-orders`,
		require('./routes/v1/purchase-order.routes'),
	);
	app.use(
		`${apiPrefix}/v1/work-orders`,
		require('./routes/v1/work-order.routes'),
	);
	app.use(
		`${apiPrefix}/v1/payment-requisitions`,
		require('./routes/v1/payment-requisition.routes'),
	);

	app.get('/', (req, res) => {
		res.status(200).json({ status: true, message: '✅ Its working.' });
	});

	app.use((req, res, next) => {
		res.status(404).json({ error: 'Route not found' });
	});

	app.use(errorHandler);

	const server = http.createServer(app);
	const io = init(server);

	const envLabel = APP_ENV === 'development' ? 'Dev' : 'Production';

	db.sequelize
		.authenticate()
		.then(async () => {
			console.log(`✅ DB connected (${envLabel})`);

			// await connect();
			// await startConsumer();

			server.listen(PORT, () => {
				console.log(`${envLabel} server running on ${BASE_URL}`);
			});
			// try {
			// 	await connectQueue();
			// 	await consumeAdminEvents();
			// 	console.log('✅ RabbitMQ connected');
			// } catch (err) {
			// 	console.error('❌ RabbitMQ connection failed:', err);
			// 	// DO NOT exit — retry instead
			// }
		})
		.catch((err) => {
			console.error(`${envLabel} DB connection failed:`, err);
			process.exit(1);
		});
	// await publishMessage();
}

prepareAndStartServer();
