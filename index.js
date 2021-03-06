'use strict';

const ClientRegister = require('./lib/client-register');
const ClientMessager = require('./lib/client-messager');
const HTTP           = require('http');
const Initializers   = require('./initializers');
const Logger         = require('./lib/logger');
const Teamster       = require('teamster');
const WSServer       = require('ws').Server;
const app            = require('koa')();

app.use(function* showHealth() {
  if (this.url === '/health') {
    this.body = 'ok';
  }
});

/**
 * A collection of private functions, run automatically when the app starts, for
 * creating our Koa app and HTTP and WS servers.
 *
 * @module Main
 */

Initializers.start()
  .then(createTeamster)
  .catch(err => { throw err; });

/**
 * Start 1 or more web processes running our app.
 *
 * @private
 */
function createTeamster() {
  Teamster.run(startServers, {
    fork      : process.env.NODE_ENV === 'production',
    numWorkers: parseInt(process.env.NUM_WORKERS, 10) || 1,
  });
}

/**
 * Start HTTP and WS servers for our app.
 *
 * @private
 */
function startServers() {
  const port = parseInt(process.env.PORT, 10) || 5000;

  HTTP.createServer(app.callback()).listen(port, function() {
    Logger.log({ event: `HTTP server listening on port ${port}` });
    startWSServer(this);
  });
}

/**
 * Start a WS server for handling WebSocket connections.
 *
 * @private
 * @param {HTTP.Server} httpServer The httpServer to attach the WS server to
 */
function startWSServer(httpServer) {
  const wsServer = new WSServer({ server: httpServer });
  wsServer.on('connection', onConnection);
}

/**
 * Handle a newly connected WebSocket connection
 *
 * @private
 * @param {WS.WebSocket} socket The new WebSocket connection
 */
function onConnection(socket) {
  const requestID = socket.upgradeReq.headers['x-request-id'];

  socket.pingInterval = setInterval(() => {
    socket.send(JSON.stringify({ ping: true }));
  }, 30000);


  ClientRegister.registerClient(socket).then(client => {
    Logger.clientLog(client, { event: 'New WebSocket client connected' });
    client.socket.on('close', () => onClose(client));
    client.socket.on('message', message => onMessage(client, message));
  }).catch(err => {
    ClientMessager.error({ socket: socket }, 'Error when joining new client');
    Logger.log({ request_id: requestID, event: 'Could not create new client' });
    Logger.error(err);
    socket.close();
  });
}

/**
 * Handle a message sent by a client.
 *
 * @private
 * @param {Client} client The client that sent the message
 * @param {string} message The message sent by the client
 */
function onMessage(client, message) {
  try {
    message = JSON.parse(message);
  } catch(err) {
    Logger.error(err);
    ClientMessager.error(client, 'Unparsable message sent');
    return;
  }

  if (message.action === 'cursor') {
      message.clientId = client.id;
      const serializedCursor = Object.keys(message).map(k => `${k}=${message[k]}`).join('|');
      ClientRegister.persistCursor(serializedCursor, client.spaceID);
      ClientRegister.renewClient(client);
      return;
  }

  if (message.action !== 'ping') {
    const err = `Unrecognized action sent: ${message.action}`;
    Logger.clientLog(client, { event: err });
    ClientMessager.error(client, err);
    return;
  }


  ClientRegister.renewClient(client);
}

/**
 * Handle a client's socket closing.
 *
 * @private
 * @param {Client} client The client whose socket has closed.
 */
function onClose(client) {
  clearInterval(client.socket.pingInterval);
  Logger.clientLog(client, { event: 'Client closed socket connection' });
  ClientRegister.deregisterClient(client);
}
