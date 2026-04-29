const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.join(__dirname, '../../proto/productUom.proto');

const packageDef = protoLoader.loadSync(PROTO_PATH, {
	keepCase: true,
	longs: String,
	enums: String,
	defaults: true,
	oneofs: true,
});
const grpcObject = grpc.loadPackageDefinition(packageDef);

// 👇 package name from proto
const productUomPackage = grpcObject.productUom;

// 👇 connect to VCP service
const client = new productUomPackage.ProductUomService(
	'localhost:50051',
	grpc.credentials.createInsecure(),
);

module.exports = client;
