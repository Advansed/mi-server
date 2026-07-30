const { startProcess, setFile } = require('./requestHandlers');
const { access } = require('node:fs/promises');
const { join } = require('node:path');

const PORT = Number(process.env.PORT ?? 3060);
const SET_FILE_PORT = Number(process.env.SET_FILE_PORT ?? 3061);
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? join(import.meta.dir, 'uploads');
const TLS_CERT = process.env.TLS_CERT ?? 'certs/server.crt';
const TLS_KEY = process.env.TLS_KEY ?? 'certs/server.key';
const TLS_CA = process.env.TLS_CA ?? 'certs/ca.crt';

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** mTLS only for set_file listener */
async function buildMtls() {
  if (!(await exists(TLS_CERT)) || !(await exists(TLS_KEY))) {
    throw new Error(`set_file mTLS needs ${TLS_CERT} and ${TLS_KEY}`);
  }
  if (!(await exists(TLS_CA))) {
    throw new Error(`set_file mTLS needs CA: ${TLS_CA}`);
  }

  return {
    cert: Bun.file(TLS_CERT),
    key: Bun.file(TLS_KEY),
    ca: Bun.file(TLS_CA),
    requestCert: true,
    rejectUnauthorized: true,
  };
}

function makeRes(resolve) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    json(data) {
      resolve(
        new Response(JSON.stringify(data), {
          status: this.statusCode,
          headers: this.headers,
        }),
      );
    },
    end(stringData) {
      const headers = String(stringData).trim().startsWith('{')
        ? this.headers
        : { ...this.headers, 'Content-Type': 'text/plain; charset=utf-8' };

      resolve(new Response(stringData, { status: this.statusCode, headers }));
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
  };
}

function corsOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function isSetFilePath(pathname) {
  return pathname === '/api/v2/set_file' || pathname === '/set_file';
}

/** Main API — HTTP, no client certificates */
const apiServer = Bun.serve({
  port: PORT,
  hostname: '0.0.0.0',

  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    console.log('api', pathname);

    if (req.method === 'OPTIONS') return corsOptions();

    if (pathname === '/health') {
      return Response.json({ status: 'ok' });
    }

    if (isSetFilePath(pathname)) {
      return Response.json(
        {
          success: false,
          message: `set_file requires mTLS on port ${SET_FILE_PORT}`,
          url: `https://<host>:${SET_FILE_PORT}/api/v2/set_file`,
        },
        { status: 403 },
      );
    }

    let params = {};
    if (req.method === 'GET') {
      params = Object.fromEntries(url.searchParams.entries());
    } else if (req.method === 'POST' || req.method === 'PUT') {
      const contentType = req.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        try {
          params = await req.json();
        } catch {
          params = {};
        }
      }
    }

    return new Promise((resolve) => {
      startProcess(pathname, params, makeRes(resolve));
    });
  },

  error(error) {
    return new Response(`Server error: ${error.message}`, { status: 500 });
  },
});

/** set_file only — HTTPS + mTLS */
const mtls = await buildMtls();

const setFileServer = Bun.serve({
  port: SET_FILE_PORT,
  hostname: '0.0.0.0',
  tls: mtls,

  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    console.log('set_file', pathname);

    if (req.method === 'OPTIONS') return corsOptions();

    if (pathname === '/health') {
      return Response.json({ status: 'ok', mtls: true });
    }

    if (isSetFilePath(pathname) && req.method === 'POST') {
      return new Promise((resolve) => {
        setFile(req, makeRes(resolve));
      });
    }

    return Response.json(
      { success: false, message: 'Only POST /api/v2/set_file on this port' },
      { status: 404 },
    );
  },

  error(error) {
    return new Response(`Server error: ${error.message}`, { status: 500 });
  },
});

console.log(`API      http://0.0.0.0:${apiServer.port}  (no client cert)`);
console.log(`set_file https://0.0.0.0:${setFileServer.port}  (mTLS)`);
console.log(`uploads  ${UPLOAD_DIR}`);
