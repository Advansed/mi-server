const { startProcess, setFile } = require('./requestHandlers');
const { access } = require('node:fs/promises');
const { join } = require('node:path');

const PORT = Number(process.env.PORT ?? 3060);
const UPLOAD_DIR           = process.env.UPLOAD_DIR ?? join(import.meta.dir, 'uploads');
const TLS_CERT             = process.env.TLS_CERT ?? 'certs/server.crt';
const TLS_KEY              = process.env.TLS_KEY ?? 'certs/server.key';
const TLS_CA               = process.env.TLS_CA ?? 'certs/ca.crt';
const REQUIRE_CLIENT_CERT  = process.env.REQUIRE_CLIENT_CERT !== 'false';
const USE_TLS              = process.env.USE_TLS !== 'false';

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function buildTls() {
  if (!USE_TLS) return undefined;
  if (!(await exists(TLS_CERT)) || !(await exists(TLS_KEY))) {
    console.warn(`TLS cert/key not found (${TLS_CERT}, ${TLS_KEY}) � HTTP without TLS`);
    return undefined;
  }

  const tls = {
    cert: Bun.file(TLS_CERT),
    key: Bun.file(TLS_KEY),
  };

  if (REQUIRE_CLIENT_CERT) {
    if (!(await exists(TLS_CA))) {
      throw new Error(`REQUIRE_CLIENT_CERT=true but CA missing: ${TLS_CA}`);
    }
    tls.ca = Bun.file(TLS_CA);
    tls.requestCert = true;
    tls.rejectUnauthorized = true;
  }

  return tls;
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

const tls = await buildTls();

const server = Bun.serve({
  port: PORT,
  hostname: '0.0.0.0',
  ...(tls ? { tls } : {}),

  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    console.log('route', pathname);

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // multipart upload: POST /api/v2/set_file  -F "file=@data.json"
    if (
      (pathname === '/api/v2/set_file' || pathname === '/set_file') &&
      req.method === 'POST'
    ) {
      return new Promise((resolve) => {
        setFile(req, makeRes(resolve));
      });
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

const scheme = tls ? 'https' : 'http';
console.log(
  `Bun Server running on ${scheme}://0.0.0.0:${server.port}` +
    (tls && REQUIRE_CLIENT_CERT ? ' (mTLS)' : ''),
);
console.log(`uploads ? ${UPLOAD_DIR}`);
