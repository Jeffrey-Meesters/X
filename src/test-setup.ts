// Gives jsdom a real IndexedDB implementation, so the persistence layer is
// genuinely exercised by tests rather than silently falling back to the
// in-memory mirror.
import 'fake-indexeddb/auto'
