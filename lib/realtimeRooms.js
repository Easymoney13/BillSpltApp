function roomSubscriptionKey(type, id) {
  return `${type}:${id}`;
}

function subscribeClient(client, type, id) {
  if (!(client.subscriptions instanceof Set)) client.subscriptions = new Set();
  client.subscriptions.add(roomSubscriptionKey(type, id));
}

function broadcastToRoom(clients, type, id, payload, openState = 1) {
  const key = roomSubscriptionKey(type, id);
  const serialized = JSON.stringify(payload);
  let recipients = 0;

  for (const client of clients) {
    if (
      client.readyState === openState
      && client.subscriptions instanceof Set
      && client.subscriptions.has(key)
    ) {
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
