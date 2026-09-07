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

const { connect } = require('./config/rabbitmq');
const { startConsumer } = require('./events/consumer');
const { registerWorkflowNotificationHandler } = require('./events/handlers/workflowNotification.handler');
const helmet = require('helmet');
const metricsMiddleware = require('./middlewares/metricsMiddleware');
const { register } = require('./utils/metrics');
const logger = require('./utils/logger');

// const limiter = rateLimit({
// 	windowMs: 1 * 60 * 1000,
// 	limit: 100,
// 	standardHeaders: 'draft-8',
// 	legacyHeaders: false,
// });

async function prepareAndStartServer() {
	app.use(helmet());
	app.use(cookieParser());
	const whitelist = CORS_WHITELIST;

	app.use(
		cors({
			origin: function (origin, callback) {
				if (whitelist.includes(origin) || !origin) {
					callback(null, true);
				} else {
					logger.error(`Blocked by CORS: ${origin}`);
					callback(new Error('Not allowed by CORS'));
				}
			},
			credentials: true,
		}),
	);
	app.use(express.json({ limit: '10mb' }));
	app.use(express.urlencoded({ extended: true, limit: '10mb' }));

	const apiPrefix = APP_ENV === 'production' ? '' : '/api';
	logger.debug('apiPrefix ', {apiPrefix});

	app.get(`${apiPrefix}/metrics`, async (req, res) => {
  		res.set('Content-Type', register.contentType);
  		res.end(await register.metrics());
	});

	app.use(metricsMiddleware);

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
	app.use(`${apiPrefix}/v1/countries`, require('./routes/v1/country.routes'));
	app.use(`${apiPrefix}/v1/states`, require('./routes/v1/state.routes'));

	app.use(
		`${apiPrefix}/v1/master`,
		require('./routes/v1/master.routes'),
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
	// Feature flag for in-progress modules pending verification before merge to tg-uat
	// (see scm-frontend's lib/featureFlags.ts for the matching client-side gate).
	// Set ENABLE_WIP_MODULES=true locally to test; route stays unmounted (404)
	// everywhere else until verified. Currently gates: GRN (Goods Receipt Note)
	if (process.env.ENABLE_WIP_MODULES === 'true') {
		app.use(
			`${apiPrefix}/v1/goods-receipt-notes`,
			require('./routes/v1/grn.routes'),
		);
	}

	app.use(
		`${apiPrefix}/v1/quality-control`,
		require('./routes/v1/qc-inspection.routes'),
	);

	app.use(
		`${apiPrefix}/v1/qc-templates`,
		require('./routes/v1/qc-template.routes'),
	);

	app.use(
		`${apiPrefix}/v1/short-close-requests`,
		require('./routes/v1/short-close.routes'),
	);

	app.use(
		`${apiPrefix}/v1/purchase-invoices`,
		require('./routes/v1/purchase-invoice.routes'),
	);

	app.use(
		`${apiPrefix}/v1/work-orders`,
		require('./routes/v1/work-order.routes'),
	);

	app.use(
		`${apiPrefix}/v1/payment-requisitions`,
		require('./routes/v1/payment-requisition.routes'),
	);

	app.use(
		`${apiPrefix}/v1/tds-liabilities`,
		require('./routes/v1/tds-liability.routes'),
	);

	app.use(
		`${apiPrefix}/v1/tds-settlements`,
		require('./routes/v1/tds-settlement.routes'),
	);

	app.use(
		`${apiPrefix}/v1/workflow-definitions`,
		require('./routes/v1/workflow-definitions.routes'),
	);

	app.get('/', (req, res) => {
		res.status(200).json({ status: true, message: '✅ Server up & running.' });
	});

	app.use((req, res, next) => {
		res.status(404).json({ error: 'Route not found' });
	});

	app.use(errorHandler);

	const server = http.createServer(app);
	const io = init(server);

	const envLabel = APP_ENV === 'development' ? 'Development' : 'Production';

	db.sequelize
		.authenticate()
		.then(async () => {
			logger.info(`🛢  DB connected | Environment: (${envLabel})`);

			await connect();
			await startConsumer();
			registerWorkflowNotificationHandler();

			server.listen(PORT, () => {
				logger.info(`🌐 ${envLabel} server running on ${BASE_URL}`);
			});
		})
		.catch((err) => {
			logger.error(`${envLabel} DB connection failed:`, {err});
			process.exit(1);
		});
}

prepareAndStartServer();
