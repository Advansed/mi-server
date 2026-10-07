const express = require('express');
const bodyParser = require('body-parser');
const url = require('url');
const cors = require('cors'); // <─ добавили
const { startProcess } = require('./requestHandlers');

const app = express();
const PORT = 3060;

app.use(cors({
  origin: '*', // или ['http://localhost:3000', 'https://mydomain.com']
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Поддержка JSON и large payload
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: false }));
app.use(bodyParser.json());

app.options('*', cors());

// Универсальный обработчик запросов
function onRequest(req, res) {
  const pathname = url.parse(req.url).pathname;
  console.log( "route", pathname )
  startProcess(pathname, req, res);
}

// В Express 5 wildcard надо писать явно:
// вместо '/*' теперь '(.*)' или '/{*splat}'
app.get('*', onRequest);
app.post('*', onRequest);


// Fallback — если ничего не совпало
app.use((req, res) => {
  res.status(404).json({ error: true, message: 'Маршрут не найден' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});

