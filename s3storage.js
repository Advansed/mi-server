function env(name, fallback = '') {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') return fallback;
  return String(v).trim();
}

function s3Endpoint() {
  const raw = env('REG_URL', 's3.regru.cloud');
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw.replace(/\/$/, '');
  return `https://${raw.replace(/\/$/, '')}`;
}

function getS3() {
  const accessKeyId = env('REG_ACCESS_KEY');
  const secretAccessKey = env('REG_SECRET_KEY');
  const bucket = env('REG_BUCKET');
  const endpoint = s3Endpoint();

  if (!accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('S3 is not configured: REG_ACCESS_KEY, REG_SECRET_KEY, REG_BUCKET required');
  }

  // Bun built-in S3 client (S3-compatible / Reg.ru)
  return {
    bucket,
    endpoint,
    client: new Bun.S3Client({
      accessKeyId,
      secretAccessKey,
      bucket,
      endpoint,
      // path-style for S3-compatible endpoints
      virtualHostedStyle: false,
    }),
  };
}

/**
 * Upload bytes to Reg.ru S3.
 * @returns {{ key: string, url: string, bucket: string, size: number }}
 */
async function uploadToS3(key, body, contentType) {
  const { client, bucket, endpoint } = getS3();

  await client.write(key, body, {
    type: contentType || 'application/octet-stream',
  });

  const url = `${endpoint}/${bucket}/${encodeURI(key).replace(/%2F/g, '/')}`;

  return {
    key,
    url,
    bucket,
    size: body.byteLength ?? body.length ?? 0,
  };
}

module.exports = { uploadToS3, getS3, s3Endpoint };
