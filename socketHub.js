const { Server } = require('socket.io');
const { runQuery } = require('./mssqldata');

let io = null;
const tokens = new Map();

const workersJob = { running: false, pending: false };
const invoicesJob = { running: false, pending: false };

function attach(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*' },
    path: '/socket.io',
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token || typeof token !== 'string') {
      next(new Error('token required'));
      return;
    }
    socket.data.token = token;
    next();
  });

  io.on('connection', (socket) => {
    tokens.set(socket.id, socket.data.token);
    sendSnapshots(socket);
    socket.on('disconnect', () => {
      tokens.delete(socket.id);
    });
  });
}

function pickToken() {
  const first = tokens.values().next();
  return first.done ? null : first.value;
}

async function readProc(name, token) {
  const result = await runQuery('exec p_' + name + ' @p0', [JSON.stringify({ token })]);
  return JSON.parse(result[0].data);
}

async function publishList(event, proc, job) {
  if (!io || tokens.size === 0) return;
  if (job.running) {
    job.pending = true;
    return;
  }

  job.running = true;
  try {
    do {
      job.pending = false;
      const token = pickToken();
      if (!token) break;
      try {
        const body = await readProc(proc, token);
        if (body && body.success !== false) {
          io.emit(event, body);
        }
      } catch (err) {
        console.error('[socket]', event, err.message);
      }
    } while (job.pending && tokens.size > 0);
  } finally {
    job.running = false;
  }
}

function publishWorkers() {
  return publishList('workers', 'workers', workersJob);
}

function publishInvoices() {
  return publishList('invoices', 'invoices', invoicesJob);
}

async function sendSnapshots(socket) {
  const token = socket.data.token;
  try {
    const [workers, invoices] = await Promise.all([
      readProc('workers', token),
      readProc('invoices', token),
    ]);
    if (!socket.connected) return;
    if (workers && workers.success !== false) socket.emit('workers', workers);
    if (invoices && invoices.success !== false) socket.emit('invoices', invoices);
  } catch (err) {
    console.error('[socket] snapshot', err.message);
  }
}

module.exports = { attach, publishWorkers, publishInvoices };
