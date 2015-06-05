'use strict';

const Bluebird     = require('bluebird');
const parseURL     = require('url-parse');
const pick         = require('lodash').pick;
const KEY_SPLITTER = '/';

/**
 * Functions for working with Client objects
 *
 * @module Client
 */

module.exports = {
  create: create,
  parsePresenceKey: parsePresenceKey,
  getPresenceKey: getPresenceKey,
  serialize: serialize,
  KEY_SPLITTER: KEY_SPLITTER,
};

/**
 * A representation of someone connected to a space over a WebSocket connection
 *
 * @typedef Client
 * @property {string} id The UUID identifying this client
 * @property {string} identity The identity value of this client (e.g. an email)
 * @property {string} spaceID The ID of the space this client is connected to
 * @property {WS.WebSocket} socket The socket the client is connected over
 * @property {string} joinedAt The time at which the client joined
 */

/**
 * A key containing information about a connected client
 *
 * The client information is all in the key, split by colons:
 *
 * longhouse:spaces:${spaceID}:${id}:${identity}:${joinedAt}
 *
 * @typedef PresenceKey
 */

/**
 * Create a new Client.
 *
 * @param {string} clientID The UUID for the new client
 * @param {WS.WebSocket} socket The socket that the new client is connected on
 * @return {Promise} A promise resolving with a new Client
 */
function create(clientID, socket) {
  const parsedURL = parseURL(socket.upgradeReq.url, true);
  const spaceID   = parsedURL.pathname.slice(1);
  const identity  = parsedURL.query.identity;

  return new Bluebird((resolve, reject) => {
    if (!spaceID) {
      reject(new Error('Space ID is required'));
    }

    if (!identity) {
      reject(new Error('No identity parameter was supplied'));
    }

    resolve(Object.freeze({
      id: clientID,
      identity: identity,
      spaceID: spaceID,
      socket: socket,
      joinedAt: new Date().toISOString(),
    }));
  });
}

/**
 * Parse a presence key for Client info
 *
 * @param {string} presenceKey A presence key
 * @return {Client} A client
 */
function parsePresenceKey(presenceKey) {
  const parts = presenceKey.split(KEY_SPLITTER);

  return {
    id: parts[3],
    identity: parts[4],
    spaceID: parts[2],
    joinedAt: parts[5],
  };
}


/**
 * Get the Redis presence key for a client.
 *
 * @param {Client} client The client to fetch the presence key for
 * @return {string} A presence key for a client
 */
function getPresenceKey(client) {
  return [
    'longhouse',
    'spaces',
    client.spaceID,
    client.id,
    client.identity,
    client.joinedAt
  ].join(KEY_SPLITTER);
}

/**
 * Serialize a client for sending to another client.
 *
 * @param {Client} client The client to serialize
 */
function serialize(client) {
  return pick(client, 'id', 'identity', 'joinedAt');
}