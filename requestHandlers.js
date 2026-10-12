const {pool, runQuery }   = require('./mssqldata');
const { publishWorkers, publishInvoices } = require('./socketHub');
const jwt                 = require('jsonwebtoken');
const bcrypt              = require('bcrypt');
const { v4: uuidv4 }      = require('uuid');
const axios               = require('axios');
const puppeteer           = require('puppeteer');


const JWT_SECRET = '26458bf6-afd9-11f0-a1b7-d00dd4f7a369'; // лучше хранить в .env


function startProcess(path, req, res) {
  // Проверяем состояние пула перед обработкой запроса

  const params = req.route.stack[0].method === 'get' ? req.query : req.body;

  switch(path.toLowerCase()) {
    
    // Системные эндпоинты

    case '/':                     res.end('Server is running with connection pool');break;

    case '/get_version':          version( res );break;
    
    case '/upd_method':           upd_method( params, res );break;
    
    case '/login':                method('login', params, res );break;

    case '/invoices':             method('invoices', params, res );break;

    case '/set_invoice':          method('set_invoice', params, res );break;
    case '/workers':              method('workers', params, res );break;
    case '/get_session':          method('get_session', params, res );break;
    case '/open_session':         method('open_session', params, res );break;
    case '/close_session':        method('close_session', params, res );break;

    case '/set_inv_address':      method('set_inv_address', params, res );break;
    case '/set_inv_worker':       method('set_inv_worker', params, res );break;
    case '/set_inv_lic':          method('set_inv_lic', params, res );break;

    case '/add_lic':              method('add_lic', params, res );break;
    case '/del_lic':              method('del_lic', params, res );break;
    case '/get_lics':             method('get_lics', params, res );break;
    case '/get_lic':              method('get_lic', params, res );break;
    
    case '/get_works':            method('get_works', params, res );break;
    case '/get_work_types':       method('get_work_types', params, res );break;

    case '/mp_invoices':          method('mp_invoices', params, res );break;
    
    case '/mp_set_inv':           method('mp_set_inv', params, res );break;
    case '/mp_get_act':           method('mp_get_act', params, res);break;         
    case '/mp_set_act':           method('mp_set_act', params, res);break;
    
    case '/mp_set_location':      method('set_location', params, res)
        .then((body) => {
          if (body && body.success !== false) publishWorkers();
        })
        .catch((err) => console.error('set_location', err));
      break;

    case '/mp_get_acts':          method('mp_get_acts', params, res);break;

    case '/mp_get_pdf':           get_pdf( params, res); break;

    ///////////////////////////////////////////////////////////////////////////////////////////////

    //case '/upd_invoices':         method("ins_invoices", params, res); break;
    case '/upd_orders':
      method_logs('ins_orders', params, res)
        .then((body) => {
          if (body && body.success !== false) publishInvoices();
        })
        .catch((err) => console.error('ins_orders', err));
      break;
    case '/upd_tarifes':          method('ins_tarifes', params, res );break;
    case '/upd_equipments':       method('ins_equipments', params, res );break;
    case '/upd_agreements':       method('ins_agreements', params, res );break;
    case '/upd_works':            method('ins_works', params, res );break;
    case '/upd_work_types':       method('ins_work_types', params, res );break;
    case '/upd_logins':           method("ins_logins", params, res); break;
    
    case '/ex_acts':              method("ex_acts", params, res); break;
    case '/ex_invoices':          method("ex_invoices", params, res); break;
         
    default:                      res.end('{"success": false, "message": "no such method ('+ path + ')"}');break;
  }
}


const version                   = async ( res ) => {
    res.json({success: true, data: {server: "mi-server", version: "1.0.1"}})
}


const method                    = async (path, params, res) => {

    const result = await runQuery("exec p_" + path + " @p0", [JSON.stringify( params )] );

    res.json( JSON.parse(result[0].data) );

}

const method_logs               = async (path, params, res) => {

  console.log(path, params);
  
  const result = await runQuery("exec p_" + path + " @p0", [JSON.stringify( params )] );

  console.log( result );

  const body = JSON.parse(result[0].data);
  res.json(body);
  return body;

}


const generate_pdf              = async ( htmlContent ) => {
  const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  await page.setContent(htmlContent, {
      waitUntil: 'networkidle0'
  });
  
  const pdf = await page.pdf({
      format:           'A4',
      orientation:      'portrait',
      landscape:        false,
      scale:            0.9,  
      printBackground:  true,
      margin: {
          top:          '0mm',
          right:        '0mm',
          bottom:       '0mm',
          left:         '0mm'
      }
  });
  
  await browser.close();
  
  return 'data:application/pdf;base64,' + Buffer.from(pdf).toString('base64');
}

const get_pdf                   = async (params, res) => {
  try {
    const { template } = params

    if (!template) {
      return res.status(400).json({ error: 'template is required' });
    }

    const dataUrl = await generate_pdf(template);

    return res.json({ success: true, data: dataUrl });
  } catch (e) {
    console.error('getPdf error:', e);
    return res.status(500).json({ success: false, message: e.message || 'PDF generation failed' });
  }
}


module.exports = { startProcess };