const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({
	region: process.env.AWS_REGION,
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID,
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
	},
});

// This function returns a signed URL for a private object
async function generateSignedUrl(key) {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
  });

  // URL valid for 15 minutes (you can change this)
  const signedUrl = await getSignedUrl(s3, command, { expiresIn: 60 * 5 });

  console.log("signedUrl ", signedUrl);
  
  return signedUrl;
}


// In-process logo cache — logos rarely change, so we hold them for 10 minutes
// to avoid re-fetching from S3 on every HTML/PDF generation request.
const _logoCache = new Map(); // key → { dataUrl, expiresAt }
const LOGO_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Fetches an S3 object and returns it as a base64 data URL.
 * Results are cached for 10 minutes so repeated template renders don't re-hit S3.
 */
async function getImageAsBase64DataUrl(key) {
	const cached = _logoCache.get(key);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.dataUrl;
	}
	try {
		const command = new GetObjectCommand({
			Bucket: process.env.AWS_BUCKET_NAME,
			Key: key,
		});
		const response = await s3.send(command);
		const chunks = [];
		for await (const chunk of response.Body) {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		}
		const buffer = Buffer.concat(chunks);
		const contentType = response.ContentType || 'image/jpeg';
		const dataUrl = `data:${contentType};base64,${buffer.toString('base64')}`;
		_logoCache.set(key, { dataUrl, expiresAt: Date.now() + LOGO_CACHE_TTL_MS });
		return dataUrl;
	} catch (err) {
		console.error('Failed to fetch image from S3 for embedding:', key, err?.message);
		return null;
	}
}

module.exports = { s3, PutObjectCommand, DeleteObjectCommand, generateSignedUrl, getImageAsBase64DataUrl };
