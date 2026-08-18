function roomSubscriptionKey(type, id) {
  return `${type}:${id}`;
}

function subscribeClient(client, type, id, authorization = null) {
  if (!(client.subscriptions instanceof Set)) client.subscriptions = new Set();
  const key = roomSubscriptionKey(type, id);
  client.subscriptions.add(key);
  if (!(client.roomAuthorizations instanceof Map)) client.roomAuthorizations = new Map();
  if (authorization) client.roomAuthorizations.set(key, authorization);
}

function broadcastToRoom(clients, type, id, payload, openState = 1, authorizeClient = null) {
  const key = roomSubscriptionKey(type, id);
  const serialized = JSON.stringify(payload);
  let recipients = 0;

  for (const client of clients) {
    if (
      client.readyState === openState
      && client.subscriptions instanceof Set
      && client.subscriptions.has(key)
    ) {
      if (typeof authorizeClient === 'function' && !authorizeClient(client, key)) {
        client.subscriptions.delete(key);
        if (client.roomAuthorizations instanceof Map) client.roomAuthorizations.delete(key);
        continue;
      }
      client.send(serialized);
      recipients += 1;
    }
  }
  return recipients;
}

module.exports = {
  roomSubscriptionKey,
  subscribeClient,
  broadcastToRoom,
};
