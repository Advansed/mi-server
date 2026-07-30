const { basename } = require('node:path');

const ALLOWED_ROUTES = [
  'login',
  'invoices',
  'set_invoice',
  'workers',
  'set_inv_address',
  'set_inv_worker',
  'set_inv_lic',
  'add_lic',
  'del_lic',
  'get_lics',
  'get_lic',
  'mp_invoices',
  'mp_get_act',
  'mp_set_act',
  'mp_get_acts',
  'upd_invoices',
  'upd_logins',
  'ex_acts',
];

function startProcess(path, params, res) {
  switch (path.toLowerCase()) {
    case '/':
      res.end('Server is running with connection pool');
      break;
    case '/get_version':
      version(res);
      break;
    case '/upd_method':
      upd_method(params, res);
      break;
    case '/mp_get_pdf':
      get_pdf(params, res);
      break;
    default:
      enRoute(path, params, res);
      break;
  }
}

const enRoute = async (path, params, res) => {
  console.log('route', path, params);

  const route = path.toLowerCase().substring(1);

  if (ALLOWED_ROUTES.includes(route)) {
    await method(route, params, res);
  } else {
    res.status(404).end('{"success": false, "message": "no such method (' + path + ')"}');
  }
};

const version = async (res) => {
  res.json({ success: true, data: { server: 'mi-server', version: '1.0.1' } });
};

const method = async (path, params, res) => {
  try {
    const { runQuery } = require('./mssqldata');
    const result = await runQuery('exec p_' + path + ' @p0', [JSON.stringify(params)]);

    console.log(path, result);

    res.json(JSON.parse(result[0].data));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const generate_pdf = async (htmlContent) => {
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

  const pdf = await page.pdf({
    format: 'A4',
    orientation: 'portrait',
    printBackground: true,
    scale: 0.9,
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
  });

  await browser.close();
  return 'data:application/pdf;base64,' + Buffer.from(pdf).toString('base64');
};

const get_pdf = async (params, res) => {
  try {
    const { template } = params;
    if (!template) {
      return res.status(400).json({ error: 'template is required' });
    }
    const dataUrl = await generate_pdf(template);
    return res.json({ success: true, data: dataUrl });
  } catch (e) {
    console.error('getPdf error:', e);
    return res.status(500).json({ success: false, message: e.message || 'PDF generation failed' });
  }
};

const upd_method = async (params, res) => {
  res.json({ success: true, message: 'upd_method ok' });
};

/**
 * POST multipart: -F "file=@data.json"
 * 1) upload to Reg.ru S3
 * 2) exec set_file @json = { url: <filename> }
 */
const setFile = async (req, res) => {
  try {
    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({
        success: false,
        message: 'Expected multipart/form-data with field "file"',
      });
    }

    let form;
    try {
      form = await req.formData();
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid multipart body' });
    }

    const entry = form.get('file');
    if (!entry || typeof entry === 'string') {
      return res.status(400).json({ success: false, message: 'Missing form field "file"' });
    }

    const safeName = basename(entry.name || 'upload.bin').replace(/[^\w.\-]+/g, '_');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${stamp}_${safeName}`;

    const bytes = new Uint8Array(await entry.arrayBuffer());
    const { uploadToS3 } = require('./s3storage');
    const uploaded = await uploadToS3(filename, bytes, entry.type || 'application/octet-stream');

    // SP: set_file(@json)  @json = { url: <filename> }
    const { execJsonProc } = require('./mssqldata');
    const payload = { url: filename };
    const result = await execJsonProc('set_file', payload);

    let db;
    try {
      db = result?.[0]?.data != null ? JSON.parse(result[0].data) : result?.[0] ?? null;
    } catch {
      db = result?.[0] ?? null;
    }

    return res.json({
      success: true,
      filename: entry.name,
      url: filename,
      s3: {
        key: uploaded.key,
        url: uploaded.url,
        bucket: uploaded.bucket,
        size: uploaded.size,
      },
      data: db,
    });
  } catch (err) {
    console.error('set_file error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'set_file failed',
    });
  }
};

module.exports = { startProcess, setFile };
