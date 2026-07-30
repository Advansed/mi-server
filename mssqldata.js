const sql = require('mssql');

// ˜˜˜˜˜˜˜˜˜˜˜˜ ˜˜˜˜˜˜˜˜˜˜˜ ˜ ˜˜˜˜˜˜ MSSQL 2025 ˜ Docker
const config = { 
  user:                         'sa',
  password:                     'T@ttoka2017',
  database:                     'mi-data',
  server:                       'localhost',
  port:                          1433,
  options: {
    encrypt:                     true, 
    trustServerCertificate:      true, // ˜˜˜ ˜˜˜˜˜˜˜˜ ˜˜˜ ˜˜˜˜˜˜˜˜˜˜ Docker
  }
};

// ˜˜˜˜˜˜˜˜˜˜ ˜˜˜ ˜˜˜˜˜˜˜˜˜˜
const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log('? ˜˜˜˜˜˜˜ ˜˜˜˜˜˜˜˜˜˜ ˜ MSSQL 2025 (Connection Pool ˜˜˜˜˜˜)');
    return pool;
  })
  .catch(err => {
    console.error('? ˜˜˜˜˜˜ ˜˜˜˜˜˜˜˜ ˜˜˜˜ ˜˜˜˜˜˜˜˜˜˜˜ ˜ MSSQL:', err.message);
    process.exit(1);
  });

// ˜˜˜˜˜˜˜˜˜˜˜˜˜ ˜˜˜˜˜ ˜˜˜˜˜˜˜˜˜˜ ˜˜˜˜˜˜˜˜, ˜˜˜˜˜˜˜ ˜˜˜˜˜˜˜ requestHandlers
const runQuery = async (query, params = []) => {
  try {
    const pool = await poolPromise;
    const request = pool.request();

    // ˜˜˜˜˜˜˜˜˜˜˜˜˜ ˜˜˜˜˜˜˜˜˜˜˜ ˜˜˜˜˜˜˜˜˜ @p0, @p1 ˜ ˜.˜.
    params.forEach((value, index) => {
      request.input(`p${index}`, value);
    });

    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error('˜˜˜˜˜˜ SQL ˜˜˜˜˜˜˜ (MSSQL):', err.message);
    throw err;
  }
};

/**
 * exec <proc> @json = '{"url":"..."}'
 */
const execJsonProc = async (procName, jsonObj) => {
  const pool = await poolPromise;
  const request = pool.request();
  request.input('json', sql.NVarChar(sql.MAX), JSON.stringify(jsonObj));
  const result = await request.query(`exec ${procName} @json`);
  return result.recordset;
};


// ˜˜˜˜˜˜˜˜˜˜˜˜˜˜˜ ˜˜˜˜˜˜, ˜˜˜˜˜˜˜ ˜˜˜˜ ˜ ˜˜˜˜˜ ˜˜˜˜˜˜˜˜˜˜˜˜ mysql/mssql ˜˜˜˜˜
const normalizePhone = (phone) => {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
};

const encodeUuid = (id) => id.toString();

module.exports = {
  sql,
  poolPromise,
  runQuery,
  execJsonProc,
  normalizePhone,
  encodeUuid,
};