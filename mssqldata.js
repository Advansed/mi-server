const sql    = require('mssql');
const crypto = require('crypto');

const config = {
  user:     'sa',
  password: 'T@ttoka2017',
  database: 'mi-data',
  server:   'localhost',
  port:     1433,
  options: {
    encrypt: false,
    trustServerCertificate: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

// глобальный пул (рекомендованный способ)
const poolPromise = sql.connect(config);

// универсальный запрос
const runQuery = async (query, params = []) => {
  try {
    const pool = await poolPromise;
    const request = pool.request();

    // @p0, @p1, ...
    params.forEach((value, index) => {
      request.input(`p${index}`, value);
    });

    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error('❌ Ошибка SQL запроса (MSSQL):', err.message);
    throw err;
  }
};

const normalizePhone = (phone) => {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
};

const verifyPassword = (inputPassword, salt, storedHash) => {
  const inputHash = crypto
    .createHash('sha256')
    .update(inputPassword + salt)
    .digest('hex');

  return inputHash === storedHash;
};

const generateSalt = () => {
  return crypto.randomBytes(16).toString('hex');
};

const hashPassword = (password, salt) => {
  return crypto
    .createHash('sha256')
    .update(password + salt)
    .digest('hex');
};

const encodeUuid = (id) => id.toString();

module.exports = {
  sql,
  runQuery,
  normalizePhone,
  verifyPassword,
  generateSalt,
  hashPassword,
  encodeUuid,
};
