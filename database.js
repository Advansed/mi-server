const mysql = require('mysql2/promise');
const crypto = require('crypto');

const pool = mysql.createPool({
  host:               'localhost',
  user:               'root',
  password:           'T@ttoka2017',
  database:           'mi-data',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0
});

const runQuery              = async(query, params = []) => {
  try {
    const [rows] = await pool.execute(query, params);
    return rows;
  } catch (err) {
    console.error('❌ Ошибка SQL запроса:', err.message);
    throw err;
  }
}

// Нормализация телефона (аналог dbo.f_normalize_phone)
const normalizePhone        = (phone) => {
    if (!phone) return '';
        // Удаляем все нецифровые символы
        return phone.replace(/\D/g, '');
}

const verifyPassword        = (inputPassword, salt, storedHash) => {
    // TODO: Замените на вашу реальную логику проверки пароля
    const crypto = require('crypto');
    const inputHash = crypto
        .createHash('sha256')
        .update(inputPassword + salt)
        .digest('hex');
        
    return inputHash === storedHash;
}

// Вспомогательные функции для регистрации
const generateSalt          = () => {
    const crypto = require('crypto');
    return crypto.randomBytes(16).toString('hex');
}

const hashPassword          = (password, salt) => {
    return crypto
        .createHash('sha256')
        .update(password + salt)
        .digest('hex');
}


const encodeUuid            = (id) => {
    // Ваша логика кодирования ID
    return id.toString();

}


// Экспорт только одного объекта с обеими сущностями!
module.exports = { pool, runQuery, normalizePhone, verifyPassword, generateSalt, hashPassword, encodeUuid };
