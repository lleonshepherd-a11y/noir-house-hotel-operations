type QueuedMessage = {
  clientMessageId: string;
  payload: Record<string, unknown>;
  queuedAt: string;
  attempts: number;
};

const DATABASE = 'noir-house-reliable-messages';
const STORE = 'outbox';

export async function queueMessage(payload: Record<string, unknown>) {
  const item: QueuedMessage = {
    clientMessageId: crypto.randomUUID(),
    payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  await put(item);
  return item;
}

export async function flushMessageQueue(token: string) {
  if (!navigator.onLine) return { sent: 0, remaining: await count() };
  const items = await all();
  let sent = 0;
  for (const item of items) {
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ...item.payload, clientMessageId: item.clientMessageId }),
      });
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) throw new PermanentDeliveryError();
        await put({ ...item, attempts: item.attempts + 1 });
        continue;
      }
      await remove(item.clientMessageId);
      sent += 1;
    } catch (error) {
      if (error instanceof PermanentDeliveryError) throw error;
      await put({ ...item, attempts: item.attempts + 1 });
    }
  }
  return { sent, remaining: await count() };
}

export function watchConnectivity(onOnline: () => void) {
  window.addEventListener('online', onOnline);
  return () => window.removeEventListener('online', onOnline);
}

class PermanentDeliveryError extends Error {}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'clientMessageId' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void) {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    action(transaction.objectStore(STORE), resolve, reject);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

function put(item: QueuedMessage) { return transact<void>('readwrite', (store, resolve, reject) => { const request = store.put(item); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); }
function remove(id: string) { return transact<void>('readwrite', (store, resolve, reject) => { const request = store.delete(id); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); }
function all() { return transact<QueuedMessage[]>('readonly', (store, resolve, reject) => { const request = store.getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
function count() { return transact<number>('readonly', (store, resolve, reject) => { const request = store.count(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
