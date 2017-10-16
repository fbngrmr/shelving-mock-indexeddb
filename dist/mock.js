"use strict";

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

require("babel-polyfill");

var _require = require('shelving-mock-event'),
    Event = _require.Event,
    EventTarget = _require.EventTarget;

// Vars.


var connections = {}; // Open connections.
var versions = {}; // Highest database versions.
var storage = {}; // Root storage.

// IndexedDB classes.

// IDBFactory mock.

var IDBFactory =
// Construct.
function IDBFactory() {
	_classCallCheck(this, IDBFactory);

	// Methods.
	Object.defineProperty(this, 'open', { value: open });
	Object.defineProperty(this, 'deleteDatabase', { value: deleteDatabase });

	// Lock it down.
	Object.freeze(this);

	// Open a connection.
	function open(name, version) {
		// Make a new request.
		// Set default handlers to ensure errors aren't masked by spotty implementations.
		var request = new IDBOpenDBRequest(name, version);
		request.onblocked = function () {
			throw new Error('IDBOpenDBRequest: Open database request was blocked because other connections could not be closed');
		};
		return request;
	}

	// Delete a database.
	// Internally we regard 'opening a connection to a falsy/zero version' as a delete request.
	function deleteDatabase(name) {
		// Make a new request.
		// Set default handlers to ensure errors aren't masked by spotty implementations.
		var request = new IDBOpenDBRequest(name, false);
		request.onblocked = function () {
			throw new Error('IDBOpenDBRequest: Open database request was blocked because other connections could not be closed');
		};
		return request;
	}
};

// Compare two keys.


Object.defineProperty(IDBFactory, 'cmp', { value: function value(a, b) {
		if (a < b) return -1;else if (a > b) return 1;else return 0;
	} });

// IDBDatabase database connection mock.

var IDBDatabase = function (_EventTarget) {
	_inherits(IDBDatabase, _EventTarget);

	// Construct.
	function IDBDatabase(dbName, version, data) {
		_classCallCheck(this, IDBDatabase);

		// Check params.
		if (!validIdentifier(dbName)) throw new TypeError('IDBDatabase: dbName must be a valid identifier');
		if (!validVersion(version)) throw new TypeError('IDBDatabase: version must be a valid version');
		if (!(data instanceof Object)) throw new TypeError('IDBDatabase: data must be an object');
		if (data.constructor !== Object) throw new TypeError('IDBDatabase: data must be a plain object');

		// EventTarget.
		// 'upgradeneeded' events require all other connections to the database to be closed in order to run.
		// So 'versionchange' is called on this connection to alert us that it needs to be closed.
		// This usually happens in a different tab/window (i.e. the the user opened a new tab that reloaded the schema from the server and the database now needs an updated schema).
		// 'versionchange' must close this connection or the connection in the other tab will be blocked (e.g. 'block' will be fired on the IDBOpenDBRequest).
		// e.g. either call `this.close` or do a `window.location = window.location` to refresh the page.

		var _this = _possibleConstructorReturn(this, (IDBDatabase.__proto__ || Object.getPrototypeOf(IDBDatabase)).call(this, null, ['abort', 'error', 'versionchange', 'close']));

		_this.onerror = function (err) {
			throw err;
		}; // Throw it up by default.

		// Vars.
		var queue = []; // Secret transaction queue for this database.
		var closed = false; // closed flag.
		var closing = false; // closing flag.
		var active = null; // Active transaction.
		var timeout = null; // Run timeout.

		// Properties.
		Object.defineProperty(_this, 'name', { value: dbName, enumerable: true });
		Object.defineProperty(_this, 'version', { value: version, enumerable: true });
		Object.defineProperty(_this, 'objectStoreNames', {
			enumerable: true,
			get: function get() {
				var names = Object.keys(data);names.sort();return names;
			},
			set: function set() {
				throw new Error('IDBDatabase: _data is read only');
			}
		});
		Object.defineProperty(_this, '_data', {
			get: function get() {
				if (closed) throw new Error('IDBDatabase: _data cannot be accessed after connection has closed');return data;
			},
			set: function set() {
				throw new Error('IDBDatabase: _data is read only');
			}
		});

		// Methods.
		Object.defineProperty(_this, 'transaction', { value: transaction });
		Object.defineProperty(_this, 'createObjectStore', { value: createObjectStore });
		Object.defineProperty(_this, 'deleteObjectStore', { value: deleteObjectStore });
		Object.defineProperty(_this, 'close', { value: close });
		Object.defineProperty(_this, '_upgradeTransaction', { value: upgradeTransaction }); // Secret _versionTransaction() method.
		Object.defineProperty(_this, '_run', { value: run }); // Secret _run() method.

		// Lock it down.
		Object.freeze(_this);

		// Add this to list of open connections.
		if (!connections[dbName]) connections[dbName] = [];
		connections[dbName].push(_this);

		// Create a transaction on this database that accesses one or more stores.
		function transaction(storeNames, mode) {
			// Check params.
			if (typeof storeNames === 'string') storeNames = [storeNames];
			if (!(storeNames instanceof Array)) throw new TypeError('IDBDatabase.transaction(): storeNames must be string or array');
			if (!storeNames.length) throw new TypeError('IDBDatabase.transaction(): storeNames cannot be empty');
			for (var i = 0; i < storeNames.length; i++) {
				if (!validIdentifier(storeNames[i])) throw new TypeError('IDBDatabase.transaction(): storeNames must only include valid identifiers');
			}if (!('length' in storeNames) || !storeNames.length) throw new TypeError('IDBDatabase.transaction(): storeNames must be an identifier or non-empty array of identifiers');
			if (mode !== 'readonly' && mode !== 'readwrite') throw new TypeError('IDBDatabase.transaction(): mode must be readwrite or readonly');

			// Check state.
			if (closed) throw new DOMException('IDBDatabase.transaction(): Database connection is closed', 'InvalidStateError');
			if (closing) throw new DOMException('IDBDatabase.transaction(): Database connection is closing', 'InvalidStateError');

			// In 20ms run the database, to run this pending transaction.
			if (!timeout) setTimeout(run, 20);

			// Return new transaction.
			var transaction = new IDBTransaction(this, storeNames, mode);
			queue.push(transaction);
			return transaction;
		}

		// Create a 'versionchange' transaction on this database.
		function upgradeTransaction() {
			// Check state.
			if (closed) throw new DOMException('IDBDatabase._upgradeTransaction(): Database connection is closed', 'InvalidStateError');
			if (closing) throw new DOMException('IDBDatabase._upgradeTransaction(): Database connection is closing', 'InvalidStateError');
			if (queue.length) throw new DOMException('IDBDatabase._upgradeTransaction(): Database connection already has transactions', 'InvalidStateError');

			// Return new transaction.
			var transaction = new IDBTransaction(this, [], 'versionchange');
			queue.push(transaction);
			return transaction;
		}

		// Create object store.
		function createObjectStore(storeName) {
			var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : { keyPath: null, autoIncrement: false },
			    _ref$keyPath = _ref.keyPath,
			    keyPath = _ref$keyPath === undefined ? null : _ref$keyPath,
			    _ref$autoIncrement = _ref.autoIncrement,
			    autoIncrement = _ref$autoIncrement === undefined ? false : _ref$autoIncrement;

			// Check params.
			if (!validIdentifier(storeName)) throw new TypeError('IDBDatabase.createObjectStore(): storeName must be valid identifier');
			if (!validKeyPath(keyPath) && keyPath !== null) throw new TypeError('IDBDatabase.createObjectStore(): keyPath must be a valid keyPath or null');
			if (typeof autoIncrement !== 'boolean') throw new TypeError('IDBDatabase.createObjectStore(): autoIncrement must be boolean');

			// Check state.
			if (closed) throw new DOMException('IDBDatabase.transaction(): Database connection is closed', 'InvalidStateError');
			if (!active) throw new DOMException('IDBDatabase.createObjectStore(): Can only be used used when a transaction is running', 'InvalidStateError');
			if (active.mode !== 'versionchange') throw new DOMException('IDBDatabase.createObjectStore(): Can only be used used within an active \'versionchange\' transaction, not \'' + active.mode + '\'', 'InvalidStateError');
			if (active._data[storeName]) throw new DOMException('IDBDatabase.createObjectStore(): Object store \'' + storeName + '\' already exists', 'ConstraintError');

			// Create a plain data template for this object store.
			active._data[storeName] = { records: new Map(), indexes: {}, key: 0, keyPath: keyPath, autoIncrement: autoIncrement };

			// Make and return the new IDBObjectStore.
			return new IDBObjectStore(active, storeName);
		}

		// Delete object store.
		function deleteObjectStore(storeName) {
			// Check params.
			if (!validIdentifier(storeName)) throw new TypeError('IDBDatabase.deleteObjectStore(): storeName must be valid identifier');

			// Check state.
			if (closed) throw new DOMException('IDBDatabase.deleteObjectStore(): Database connection is closed', 'InvalidStateError');
			if (!active) throw new DOMException('IDBDatabase.deleteObjectStore(): Can only be used used within an active \'versionchange\' transaction', 'InvalidStateError');
			if (active.mode !== 'versionchange') throw new DOMException('IDBDatabase.deleteObjectStore(): Can only be used used within an active \'versionchange\' transaction', 'InvalidStateError');
			if (!active._data[storeName]) throw new DOMException('IDBDatabase.deleteObjectStore(): Object store \'' + storeName + '\' does not exist', 'NotFoundError');

			// Delete the object store on the transaction.
			delete active._data[storeName];
		}

		// Close the connection to this database.
		// This will block any more transactions from being opened.
		function close() {
			var _this2 = this;

			// Check state.
			if (closed) throw new DOMException('IDBDatabase.close(): Database connection is closed', 'InvalidStateError');
			if (closing) return; // Already closing.

			// Close is pending.
			// Blocks any new transactions from being made.
			closing = true;

			// Run any remaining transactions before we close.
			run();

			// Closed.
			closed = true;

			// Remove this connection from connections list.
			connections[dbName] = connections[dbName].filter(function (connection) {
				return connection !== _this2;
			});

			// Event.
			this.dispatchEvent(new Event('close', { bubbles: true }));
		}

		// Run any pending transactions.
		function run() {
			// Check state.
			if (closed) throw new DOMException('IDBDatabase._run(): Database connection is closed', 'InvalidStateError');

			// Stop run() running run again in future.
			clearTimeout(timeout);
			timeout = false;

			// Run each transaction.
			while (queue.length) {
				// Activate and run.
				active = queue.shift();
				active._run();
				active = null;
			}
		}
		return _this;
	}

	return IDBDatabase;
}(EventTarget);

// IDBTransaction mock.


var IDBTransaction = function (_EventTarget2) {
	_inherits(IDBTransaction, _EventTarget2);

	// Construct.
	function IDBTransaction(db, storeNames) {
		var mode = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 'readonly';

		_classCallCheck(this, IDBTransaction);

		// Check params.
		if (!(db instanceof IDBDatabase)) throw new TypeError('IDBTransaction: db must be an IDBDatabase');
		if (!(storeNames instanceof Array)) throw new TypeError('IDBTransaction: storeNames must be array');
		for (var i = 0; i < storeNames.length; i++) {
			if (!validIdentifier(storeNames[i])) throw new TypeError('IDBTransaction: storeNames must only include valid identifiers');
		}if (mode !== 'readonly' && mode !== 'readwrite' && mode !== 'versionchange') throw new TypeError('IDBTransaction: mode must be readwrite, readonly, or versionchange');

		// Vars.
		var stores = {}; // List of instantiated IDBObjectStore instances that have been initialised for this transaction.
		var queue = []; // Secret requests queue for this transaction.
		var data = db._data; // Database data.
		var finished = false; // Whether this transaction is finished or not (can have requests made on it).
		var active = null; // The active request on this transaction.
		var aborted = false; // Whether this transaction has been aborted.

		// EventTarget.

		// Freeze store names.
		var _this3 = _possibleConstructorReturn(this, (IDBTransaction.__proto__ || Object.getPrototypeOf(IDBTransaction)).call(this, db, ['complete', 'error', 'abort']));

		Object.freeze(storeNames);

		// Properties.
		Object.defineProperty(_this3, 'db', { value: db, enumerable: true });
		Object.defineProperty(_this3, 'mode', { value: mode, enumerable: true });
		Object.defineProperty(_this3, 'objectStoreNames', { value: storeNames, enumerable: true });
		Object.defineProperty(_this3, 'error', {
			get: function get() {
				if (!finished) throw new Error('IDBTransaction: error can only be accessed after transaction has finished');return null;
			},
			set: function set() {
				throw new Error('IDBTransaction: error is read only');
			}
		});
		Object.defineProperty(_this3, '_finished', {
			get: function get() {
				return finished;
			},
			set: function set() {
				throw new Error('IDBTransaction: _finished is read only');
			}
		});
		Object.defineProperty(_this3, '_data', {
			get: function get() {
				if (finished) throw new Error('IDBTransaction: _data cannot be accessed after transaction has finished');return data;
			},
			set: function set() {
				throw new Error('IDBTransaction: _data is read only');
			}
		});

		// Methods.
		Object.defineProperty(_this3, 'objectStore', { value: objectStore });
		Object.defineProperty(_this3, 'abort', { value: abort });
		Object.defineProperty(_this3, '_request', { value: request }); // Secret _request() method.
		Object.defineProperty(_this3, '_run', { value: run }); // Secret _run() method.

		// Lock it down.
		Object.freeze(_this3);

		// Get object store.
		function objectStore(storeName) {
			// Check params.
			if (!validIdentifier(storeName)) throw new TypeError('IDBTransaction.objectStore(): storeName must be valid identifier');

			// Check state.
			if (finished) throw new DOMException('IDBTransaction.objectStore(): Transaction has already finished', 'InvalidStateError');
			if (storeNames.indexOf(storeName) < 0) throw new DOMException('IDBTransaction.objectStore(): Object store is not in this transaction\'s scope', 'NotFoundError');
			if (!data[storeName]) throw new DOMException('IDBTransaction.objectStore(): Object store \'' + storeName + '\' does not exist', 'NotFoundError');

			// Make a new IDBObjectStore instance.
			// Add it to the list of instantiated object stores and return it.
			if (!stores[storeName]) stores[storeName] = new IDBObjectStore(this, storeName);
			return stores[storeName];
		}

		// Abort this transaction.
		// Means that changes made by this transaction won't be committed.
		function abort() {
			// Checks.
			if (finished) throw new DOMException('IDBTransaction.abort(): Transaction has already finished', 'InvalidStateError');

			// Aborted.
			finished = true;
			aborted = true;
		}

		// Add a request to this transaction.
		function request(input, callback) {
			// Checks.
			if (finished) throw new DOMException('IDBTransaction: Cannot create request when transaction has already finished', 'InvalidStateError');

			// New or existing request.
			if (input instanceof IDBRequest) {
				// Existing request.
				queue.push(input);
				return input;
			} else {
				// Create request, add to queue, and return it.
				var _request = new IDBRequest(input, callback);
				queue.push(_request);
				return _request;
			}
		}

		// Run this transaction.
		function run() {
			// Check state.
			if (finished) throw new DOMException('IDBTransaction._run(): Transaction has already finished', 'InvalidStateError');
			if (active) throw new DOMException('IDBTransaction._run(): Transaction is currently running', 'InvalidStateError');

			// Make a clone of data.
			var original = data;
			data = {};
			for (var store in original) {
				// This is fussy because we need to clone the records Map manually.
				// clone() borks at any non-JSON values.
				data[store] = Object.assign({}, original[store], {
					records: new Map(original[store].records),
					indexes: Object.assign({}, original[store].indexes)
				});
			}

			// Run each request in the request queue.
			while (!aborted && queue.length) {
				// Activate and run.
				active = queue.shift();
				active._run();
				active = false;
			}

			// Finished.
			finished = true;

			// Was it aborted?
			if (aborted) {
				// Abort any pending queue.
				while (queue.length) {
					queue.shift()._abort();
				} // 'abort' event.
				// This is a 'non-erroring' abort, i.e. 'error' isn't set.
				this.dispatchEvent(new Event('abort', { bubbles: true, cancelable: false }));
			} else {
				// Commit the changes back into the database.
				for (var _store in original) {
					delete original[_store];
				}for (var _store2 in data) {
					original[_store2] = data[_store2];
				} // 'complete' event.
				this.dispatchEvent(new Event('complete', { bubbles: false, cancelable: false }));
			}
		}
		return _this3;
	}

	return IDBTransaction;
}(EventTarget);

// IDBRequest mock.


var IDBRequest = function (_EventTarget3) {
	_inherits(IDBRequest, _EventTarget3);

	// Construct.
	function IDBRequest(input, callback) {
		_classCallCheck(this, IDBRequest);

		// Check params.
		var transaction = void 0,
		    source = void 0;
		if (input instanceof IDBTransaction) {
			transaction = input;
			source = null;
		} else if (input instanceof IDBObjectStore) {
			transaction = input.transaction;
			source = input;
		} else if (input instanceof IDBIndex) {
			transaction = input.objectStore.transaction;
			source = input;
		} else throw new TypeError('IDBRequest: input must be an IDBTransaction, IDBObjectStore, or IDBIndex');
		if (!(transaction instanceof IDBTransaction)) throw new TypeError('IDBRequest: transaction must be an IDBTransaction');
		if (typeof callback !== 'function') throw new TypeError('IDBRequest: callback must be a function');

		// Vars.
		var result = undefined; // The result, if any, that this request generated.
		var active = true; // Whether request is still active (pending) or complete (done).
		var error = undefined; // Error, if any, on this request. Used when request is aborted.

		// EventTarget.

		// Properties.
		var _this4 = _possibleConstructorReturn(this, (IDBRequest.__proto__ || Object.getPrototypeOf(IDBRequest)).call(this, transaction, ['success', 'error']));

		Object.defineProperty(_this4, 'transaction', { value: transaction, enumerable: true });
		Object.defineProperty(_this4, 'source', { value: source, enumerable: true });
		Object.defineProperty(_this4, 'readyState', {
			enumerable: true,
			get: function get() {
				return active ? 'pending' : 'done';
			},
			set: function set() {
				throw new Error('IDBRequest: readyState is read only');
			}
		});
		Object.defineProperty(_this4, 'result', {
			enumerable: true,
			get: function get() {
				if (active) throw new DOMException('IDBRequest: Cannot get result until request is done', 'InvalidStateError');return result;
			},
			set: function set() {
				throw new Error('IDBRequest: result is read only');
			}
		});
		Object.defineProperty(_this4, 'error', {
			enumerable: true,
			get: function get() {
				if (active) throw new DOMException('IDBRequest: Cannot get error until request is done', 'InvalidStateError');return error;
			},
			set: function set() {
				throw new Error('IDBRequest: error is read only');
			}
		});

		// Methods.
		Object.defineProperty(_this4, '_run', { value: run }); // Secret _run() method.
		Object.defineProperty(_this4, '_rerun', { value: rerun }); // Secret _rerun() method.
		Object.defineProperty(_this4, '_abort', { value: abort }); // Secret _abort() method.

		// Lock it down.
		Object.freeze(_this4);

		// Run this request.
		function run() {
			// Get result.
			active = true;
			result = callback(this);
			active = false;

			// Event.
			this.dispatchEvent(new Event('success', { bubbles: false, cancelable: false }));
		}

		// Rerun this request.
		// By adding it to the end of its transaction's queue.
		function rerun() {
			// Add to the request queue for the transaction.
			// Will fail if the transaction has already finished.
			transaction._request(this);
		}

		// Abort this request.
		// Called when this request is part of an aborted transaction.
		function abort() {
			// Error.
			result = undefined;
			error = new DOMException('IDBRequest: Request\'s transaction has been aborted', 'AbortError');
			active = false;

			// Event.
			this.dispatchEvent(new Event('error', { bubbles: true, cancelable: true }));
		}
		return _this4;
	}

	return IDBRequest;
}(EventTarget);

// IDBOpenDBRequest mock.


var IDBOpenDBRequest = function (_EventTarget4) {
	_inherits(IDBOpenDBRequest, _EventTarget4);

	// Construct.
	function IDBOpenDBRequest(dbName, version) {
		var _this5;

		_classCallCheck(this, IDBOpenDBRequest);

		// Checks.
		if (!validIdentifier(dbName)) throw new TypeError('IDBOpenDBRequest: dbName must be valid identifier');
		if (!validVersion(version) && version !== false) throw new TypeError('IDBOpenDBRequest: version must be a valid version or false');

		// Vars.
		var result = undefined; // The result, if any, that this request generated.
		var active = true; // Whether request is still active (pending) or complete (done).
		var transaction = null; // Transaction under this request.

		// EventTarget.
		var request = (_this5 = _possibleConstructorReturn(this, (IDBOpenDBRequest.__proto__ || Object.getPrototypeOf(IDBOpenDBRequest)).call(this, null, ['success', 'error', 'blocked', 'upgradeneeded'])), _this5);

		// Properties.
		Object.defineProperty(_this5, 'transaction', {
			get: function get() {
				return transaction;
			},
			set: function set() {
				throw new Error('IDBRequest: transaction is read only');
			}
		});
		Object.defineProperty(_this5, 'source', { value: null });
		Object.defineProperty(_this5, 'readyState', {
			get: function get() {
				return active ? 'pending' : 'done';
			},
			set: function set() {
				throw new Error('IDBRequest: readyState is read only');
			}
		});
		Object.defineProperty(_this5, 'result', {
			get: function get() {
				if (active) throw new DOMException('IDBRequest: Cannot get result until request is done', 'InvalidStateError');return result;
			},
			set: function set() {
				throw new Error('IDBRequest: result is read only');
			}
		});
		Object.defineProperty(_this5, 'error', {
			get: function get() {
				if (active) throw new DOMException('IDBRequest: Cannot get error until request is done', 'InvalidStateError');return null;
			},
			set: function set() {
				throw new Error('IDBRequest: error is read only');
			}
		});

		// Lock it down.
		Object.freeze(_this5);

		// Open requests automatically run.
		// Allow 20ms — enough time for user to attach handlers etc.
		setTimeout(run, 20);

		// Run this request.
		function run() {
			// Vars.
			var oldVersion = versions[dbName] || 0;

			// Check state.
			if (!active) throw new DOMException('IDBOpenDBRequest._run(): Request has already been run', 'InvalidStateError');

			// Already stopped.
			active = false;

			// Check version.
			if (!version) // Open request.
				{
					// Delete request (falsy/zero version).
					if (!close()) return;

					// Delete.
					delete connections[dbName];
					delete versions[dbName];
					delete storage[dbName];

					// Success.
					request.dispatchEvent(new Event('success', { bubbles: false, cancelable: false }));
				} else if (version < oldVersion) {
				// Request for an older version.
				throw new DOMException('IDBOpenDBRequest: Requested version is lower than current version', 'VersionError');
			} else if (version === oldVersion) {
				// Request for current version.
				result = new IDBDatabase(dbName, version, storage[dbName]);

				// Dispatch 'success'.
				request.dispatchEvent(new Event('success', { bubbles: false, cancelable: false }));
			} else if (version > oldVersion) {
				// Request for a newer version.
				// Close all connections first.
				if (!close()) return;

				// Make a database.
				var db = new IDBDatabase(dbName, version, {}); // New database.
				var tx = db._upgradeTransaction(); // 'versionchange' transaction.

				// Add a temp/wrapper request on the transaction.
				tx._request(tx, function () {

					// Result is DB.
					result = db;

					// Dispatch 'upgradeneeded' on the IDBOpenDBRequest.
					transaction = tx;
					request.dispatchEvent(new IDBVersionChangeEvent('upgradeneeded', oldVersion, version));
					transaction = null;
				});

				// Run the database now to run the 'versionchange' transaction.
				db._run();

				// Commit the changes.
				versions[dbName] = version; // Increment version number.
				storage[dbName] = db._data; // Set current global data store to request database's store.

				// Dispatch 'success' event on the open request.
				request.dispatchEvent(new Event('success', { bubbles: false, cancelable: false }));
			}
		}

		// Close all other connections.
		function close() {
			// Are there connections open?
			if (connections[dbName] && connections[dbName].length) {
				// Close other connections (dispatch 'versionchange' on each).
				// If connections are still open, block this open request.
				connections[dbName].forEach(function (connection) {
					return connection.dispatchEvent(new Event('versionchange', { bubbles: false, cancelable: false }));
				});

				// Fail if connections are still open.
				if (connections[dbName].length) {
					// 'blocked' event.
					request.dispatchEvent(new Event('blocked', { bubbles: false, cancelable: false }));

					// Fail.
					return false;
				}
			}

			// Win.
			return true;
		}
		return _this5;
	}

	return IDBOpenDBRequest;
}(EventTarget);

// IDBObjectStore mock.


var IDBObjectStore =
// Construct.
function IDBObjectStore(transaction, storeName) {
	_classCallCheck(this, IDBObjectStore);

	// Check params.
	if (!(transaction instanceof IDBTransaction)) throw new TypeError('IDBObjectStore: transaction must be a transaction');
	if (!validIdentifier(storeName)) throw new TypeError('IDBObjectStore: storeName must be valid identifier');

	// Check state.
	if (transaction._finished) throw new DOMException('IDBObjectStore: Transaction has finished', 'InvalidStateError');
	if (!transaction._data[storeName]) throw new DOMException('IDBObjectStore: Object store \'' + storeName + '\' does not exist', 'InvalidStateError');

	// Vars.
	var store = this;
	var _transaction$_data$st = transaction._data[storeName],
	    keyPath = _transaction$_data$st.keyPath,
	    autoIncrement = _transaction$_data$st.autoIncrement;

	// Properties.

	Object.defineProperty(this, 'transaction', { value: transaction, enumerable: true });
	Object.defineProperty(this, 'name', { value: storeName, enumerable: true }); // @todo In IDB 2.0 name is editable.
	Object.defineProperty(this, 'keyPath', { value: keyPath, enumerable: true });
	Object.defineProperty(this, 'autoIncrement', { value: autoIncrement, enumerable: true });
	Object.defineProperty(this, 'indexNames', {
		enumerable: true,
		get: function get() {
			var names = Object.keys(transaction._data[storeName].indexes);names.sort();return names;
		},
		set: function set() {
			throw new Error('IDBObjectStore: indexNames is read only');
		}
	});

	// Methods.
	Object.defineProperty(this, 'count', { value: count });
	Object.defineProperty(this, 'get', { value: get });
	Object.defineProperty(this, 'openCursor', { value: openCursor });
	Object.defineProperty(this, 'put', { value: put });
	Object.defineProperty(this, 'add', { value: add });
	Object.defineProperty(this, 'delete', { value: _delete });
	Object.defineProperty(this, 'clear', { value: clear });
	Object.defineProperty(this, 'index', { value: index });
	Object.defineProperty(this, 'createIndex', { value: createIndex });
	Object.defineProperty(this, 'deleteIndex', { value: deleteIndex });

	// Lock it down.
	Object.freeze(this);

	// Count documents.
	function count() {
		var key = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : undefined;

		// Check params.
		if (!validKey(key) && !validKeyRange(key) && key !== undefined) throw new DOMException('count(): The key parameter was provided but does not contain a valid key (number, string, date), key range (IDBKeyRange or array of valid keys), or undefined', 'DataError');

		// Check state.
		if (transaction._finished) throw new DOMException('IDBObjectStore.count(): Transaction has finished', 'InvalidStateError');

		// Return an IDBRequest on the transaction returns the count from a cursor.
		return transaction._request(store, function (request) {

			// Check state.
			if (transaction._finished) throw new DOMException('IDBObjectStore.count(): Transaction has finished', 'InvalidStateError');
			if (!transaction._data[storeName]) throw new DOMException('IDBIndex.count(): Object store \'' + storeName + '\' does not exist', 'InvalidStateError');

			// Return the number of keys found on the cursor.
			return new IDBCursor(request, key)._count;
		});
	}

	// Get a single result.
	// Returns a request that fires a 'success' event when its result is available.
	// `request.result` will be either:
	// 1. The value for the first result with a key matching `key`.
	// 2. `undefined`, if there are no matching results.
	function get() {
		var key = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : undefined;

		// Check params.
		if (!validKey(key) && !validKeyRange(key) && key !== undefined) throw new DOMException('count(): The key parameter was provided but does not contain a valid key (number, string, date), key range (IDBKeyRange or array of valid keys), or undefined', 'DataError');

		// Check state.
		if (transaction._finished) throw new DOMException('IDBObjectStore.get(): Transaction has finished', 'InvalidStateError');

		// Return an IDBRequest on the transaction.
		return transaction._request(store, function (request) {

			// Check state.
			if (transaction._finished) throw new DOMException('IDBObjectStore.get(): Transaction has finished', 'InvalidStateError');
			if (!transaction._data[storeName]) throw new DOMException('IDBIndex.get(): Object store \'' + storeName + '\' does not exist', 'InvalidStateError');

			// Return the value of the first key found by the cursor.
			return new IDBCursorWithValue(request, key).value;
		});
	}

	// Open a cursor to retrieve several results.
	// Returns a request that fires one or more 'success' events when its results is available.
	// Continues to fire 'success' as many times as `cursor.continue()` is called and results are available.
	// request.result will be either:
	// 1. An `IDBCursor` (with `cursor.value` and `cursor.key` to read values, and `cursor.continue()` method to continue).
	// 2. `undefined`, if there are no more results.
	function openCursor() {
		var query = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : undefined;
		var direction = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'next';

		// Check params.
		if (!validKey(query) && !validKeyRange(query) && query !== undefined) throw new DOMException('count(): The query parameter not contain a valid key (number, string, date), key range (IDBKeyRange or array of valid keys), or undefined', 'DataError');
		if (direction !== 'next' && direction !== 'prev') throw new TypeError('IDBCursor: direction must be one of \'next\' or \'prev\' (\'nextunique\' or \'prevunique\' are not relevant for primary keys, which must be unique)');

		// Check state.
		if (transaction._finished) throw new DOMException('IDBObjectStore.openCursor(): Transaction has finished', 'InvalidStateError');

		// Return an IDBRequest.
		// The result of the request is an IDBCursor (if there's a value at the current cursor position),
		// or undefined (if there isn't, because we iterated past the end or there were no results).
		var cursor = void 0;
		return transaction._request(store, function (request) {

			// Check state.
			if (transaction._finished) throw new DOMException('IDBObjectStore.openCursor(): Transaction has finished', 'InvalidStateError');
			if (!transaction._data[storeName]) throw new DOMException('IDBIndex.openCursor(): Object store \'' + storeName + '\' does not exist', 'InvalidStateError');

			// Make a cursor if it doesn't exist.
			// Don't create the cursor until the request is run.
			// (Otherwise records added by other requests between this request being created and it being run, won't be included.)
			if (!cursor) cursor = new IDBCursorWithValue(request, query, direction);

			// Return cursor if there is a value.
			return cursor.primaryKey !== undefined ? cursor : undefined;
		});
	}

	// Save a document to a specified key.
	// Returns a request that fires 'success' event when `value` has been saved under `key`.
	function put(value, key) {
		// Check params.
		if (!(value instanceof Object)) throw new DOMException('IDBObjectStore.put(): value must be an object', 'DataError');
		if (keyPath) {
			// Checks for in-line keys (key at value.keyPath).
			// key parameter must not be set.
			if (key !== undefined) throw new DOMException('IDBObjectStore.put(): key parameter cannot be set (use value.' + keyPath + ' instead)', 'DataError');
			key = value[keyPath];
			if (key !== undefined && !validKey(key)) throw new DOMException('IDBObjectStore.put(): inline key (value.' + keyPath + ') must be a valid key (number, string, date)', 'DataError');
			if (key === undefined && !autoIncrement) throw new DOMException('IDBObjectStore.put(): inline key (value.' + keyPath + ') must be set (object store does not autoincrement)', 'DataError');
		} else {
			// Checks for out-of-line keys (key parameter).
			if (key !== undefined && !validKey(key)) throw new DOMException('IDBObjectStore.put(): key parameter must be valid key (number, string, date)', 'DataError');
			if (key === undefined && !autoIncrement) throw new DOMException('IDBObjectStore.put(): key parameter must be set (object store does not autoincrement)', 'DataError');
		}

		// Check state.
		if (transaction._finished) throw new DOMException('IDBObjectStore.put(): Transaction has finished', 'InvalidStateError');
		if (transaction.mode === 'readonly') throw new DOMException('IDBObjectStore.put(): Transaction is read only', 'ReadOnlyError');

		// Clone.
		try {
			value = clone(value);
		} catch (err) {
			throw new DOMException('IDBObjectStore.put(): value must be JSON-friendly value (string, finite number, null, true, false, plain array, plain object)', 'DataCloneError');
		}

		// Return an IDBRequest on the transaction that saves the value at the key.
		return transaction._request(store, function () {

			// Check state.
			if (transaction._finished) throw new DOMException('IDBObjectStore.put(): Transaction has finished', 'InvalidStateError');
			if (!transaction._data[storeName]) throw new DOMException('IDBObjectStore.put(): Object store \'' + storeName + '\' does not exist', 'InvalidStateError');

			// Generate a key if it's not set.
			if (key === undefined) {
				// Generate a key.
				transaction._data[storeName].key++;
				key = transaction._data[storeName].key;

				// Set key on value if keyPath is set.
				if (keyPath) value[keyPath] = key;
			}

			// Save the value.
			var records = transaction._data[storeName].records;
			records.set(key, value);
		});
	}

	// Alias for put()
	function add(value, key) {
		return store.put(value, key);
	}

	// Delete a record by key.
	function _delete(range) {
		// Check params.
		if (!validKey(range) && !validKeyRange(range)) throw new DOMException('IDBObjectStore.delete(): The range parameter was provided but does not contain a valid key (number, string, date) or key range (IDBKeyRange or array of valid keys)', 'DataError');

		// Check state.
		if (transaction.mode === 'readonly') throw new DOMException('IDBObjectStore.delete(): Transaction is read only', 'ReadOnlyError');
		if (transaction._finished) throw new DOMException('IDBObjectStore.delete(): Transaction has finished', 'InvalidStateError');

		// Return an IDBRequest on the transaction that deletes values in the range.
		return transaction._request(store, function () {

			// Check state.
			if (transaction._finished) throw new DOMException('IDBObjectStore.delete(): Transaction has finished', 'InvalidStateError');
			if (!transaction._data[storeName]) throw new DOMException('IDBObjectStore.delete(): Object store \'' + storeName + '\' does not exist', 'InvalidStateError');

			// Delete matching keys in records.
			var records = transaction._data[storeName].records;
			var _iteratorNormalCompletion = true;
			var _didIteratorError = false;
			var _iteratorError = undefined;

			try {
				for (var _iterator = records[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
					var _step$value = _slicedToArray(_step.value, 1),
					    primary = _step$value[0];

					if (keyInRange(primary, range)) records.delete(primary);
				}
			} catch (err) {
				_didIteratorError = true;
				_iteratorError = err;
			} finally {
				try {
					if (!_iteratorNormalCompletion && _iterator.return) {
						_iterator.return();
					}
				} finally {
					if (_didIteratorError) {
						throw _iteratorError;
					}
				}
			}
		});
	}

	// Clear all documents.
	function clear() {
		// Check state.
		if (transaction._finished) throw new DOMException('IDBObjectStore.clear(): Transaction has finished', 'InvalidStateError');

		// Return an IDBRequest on the transaction that deletes everything in the store.
		return transaction._request(store, function () {

			// Check state.
			if (transaction._finished) throw new DOMException('IDBObjectStore.clear(): Transaction has finished', 'InvalidStateError');
			if (!transaction._data[storeName]) throw new DOMException('IDBObjectStore.clear(): Object store \'' + storeName + '\' does not exist', 'InvalidStateError');

			// Clear all records.
			transaction._data[storeName].records.clear();
		});
	}

	// Get an existing index.
	function index(indexName) {
		// Check params.
		if (!validIdentifier(indexName)) throw new TypeError('IDBObjectStore.index(): indexName must be a valid identifier');

		// Check state.
		if (transaction._finished) throw new DOMException('IDBObjectStore.index(): Transaction has finished', 'InvalidStateError');
		if (!transaction._data[storeName]) throw new DOMException('IDBObjectStore.index(): Object store \'' + storeName + '\' does not exist', 'InvalidStateError');
		if (!transaction._data[storeName].indexes[indexName]) throw new DOMException('IDBObjectStore.index(): Index \'' + indexName + '\' does not exist', 'InvalidStateError');

		// Return the existing index.
		return new IDBIndex(store, indexName);
	}

	// Create an index on this object store.
	function createIndex(indexName, keyPath) {
		var _ref2 = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : { unique: false, multiEntry: false },
		    _ref2$unique = _ref2.unique,
		    unique = _ref2$unique === undefined ? false : _ref2$unique,
		    _ref2$multiEntry = _ref2.multiEntry,
		    multiEntry = _ref2$multiEntry === undefined ? false : _ref2$multiEntry;

		// Check params.
		if (!validIdentifier(indexName)) throw new TypeError('IDBObjectStore.createIndex(): indexName must be a valid identifier');
		if (!validKeyPath(keyPath) && !validMultiKeyPath(keyPath)) throw new TypeError('IDBObjectStore.createIndex(): keyPath must be a valid key path (\'a\' or \'a.b\') or array of valid key paths');
		if (typeof unique !== 'boolean') throw new TypeError('IDBObjectStore.createIndex(): unique must be boolean');
		if (typeof multiEntry !== 'boolean') throw new TypeError('IDBObjectStore.createIndex(): multiEntry must be boolean');

		// Block array keys.
		if (validMultiKeyPath(keyPath)) throw new TypeError('IDBObjectStore.createIndex(): array keyPaths are not yet supported by this mock'); // @todo add support for array keyPaths.

		// Check state.
		if (transaction._finished) throw new DOMException('IDBObjectStore.createIndex(): Transaction has finished', 'InvalidStateError');
		if (transaction.mode !== 'versionchange') throw new DOMException('IDBObjectStore.createIndex(): Can only be used used within an active \'versionchange\' transaction, not \'' + transaction.mode + '\'', 'InvalidStateError');
		if (!transaction._data[storeName]) throw new DOMException('IDBObjectStore.createIndex(): Object store \'' + storeName + '\' does not exist', 'InvalidStateError');
		if (transaction._data[storeName].indexes[indexName]) throw new DOMException('IDBObjectStore.createIndex(): Index already exists', 'ConstraintError');

		// Create a plain data template for this index.
		transaction._data[storeName].indexes[indexName] = { keyPath: keyPath, unique: unique, multiEntry: multiEntry };

		// Return a new IDBIndex.
		return new IDBIndex(store, indexName);
	}

	// Delete an index on this object store.
	function deleteIndex(indexName) {
		// Check params.
		if (!validIdentifier(indexName)) throw new TypeError('IDBObjectStore.deleteIndex(): indexName must be a valid identifier');

		// Check state.
		if (transaction._finished) throw new DOMException('IDBObjectStore.deleteIndex(): Transaction has finished', 'InvalidStateError');
		if (transaction.mode !== 'versionchange') throw new DOMException('IDBObjectStore.deleteIndex(): Can only be used used within an active \'versionchange\' transaction, not \'' + transaction.mode + '\'', 'InvalidStateError');
		if (!transaction._data[storeName]) throw new DOMException('IDBObjectStore.deleteIndex(): Object store \'' + storeName + '\' does not exist', 'InvalidStateError');
		if (!transaction._data[storeName].indexes[indexName]) throw new DOMException('IDBObjectStore.deleteIndex(): Index \'' + indexName + '\' does not exist', 'NotFoundError');

		// Delete the index.
		delete transaction._data[storeName].indexes[indexName];
	}
};

// IDBIndex mock.


var IDBIndex =
// Construct.
function IDBIndex(store, indexName) {
	_classCallCheck(this, IDBIndex);

	// Check params.
	if (!(store instanceof IDBObjectStore)) throw new TypeError('IDBIndex: store must be an IDBObjectStore');
	if (!validIdentifier(indexName)) throw new TypeError('IDBIndex: indexName must be a valid identifier');

	// Vars.
	var index = this;
	var storeName = store.name;
	var transaction = store.transaction;

	// Check state.
	if (!transaction._data[storeName]) throw new DOMException('IDBIndex: Object store \'' + storeName + '\' does not exist', 'InvalidStateError');
	if (!transaction._data[storeName].indexes[indexName]) throw new DOMException('IDBIndex: Index \'' + indexName + '\' does not exist', 'InvalidStateError');

	// Vars.
	var _transaction$_data$st2 = transaction._data[storeName].indexes[indexName],
	    keyPath = _transaction$_data$st2.keyPath,
	    unique = _transaction$_data$st2.unique,
	    multiEntry = _transaction$_data$st2.multiEntry;

	// Properties.

	Object.defineProperty(this, 'objectStore', { value: store, enumerable: true });
	Object.defineProperty(this, 'name', { value: indexName, enumerable: true });
	Object.defineProperty(this, 'keyPath', { value: keyPath, enumerable: true });
	Object.defineProperty(this, 'multiEntry', { value: multiEntry, enumerable: true });
	Object.defineProperty(this, 'unique', { value: unique, enumerable: true });

	// Methods.
	Object.defineProperty(this, 'count', { value: count });
	Object.defineProperty(this, 'get', { value: get });
	Object.defineProperty(this, 'openCursor', { value: openCursor });

	// Lock it down.
	Object.freeze(this);

	// Count documents.
	function count() {
		var key = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : undefined;

		// Check params.
		if (!validKey(key) && !validKeyRange(key) && key !== undefined) throw new DOMException('count(): The key parameter was provided but does not contain a valid key (number, string, date), key range (IDBKeyRange or array of valid keys), or undefined', 'DataError');

		// Check state.
		if (transaction._finished) throw new DOMException('IDBIndex.count(): Transaction has finished', 'InvalidStateError');
		if (!transaction._data[storeName]) throw new DOMException('IDBIndex.count(): Object store \'' + storeName + '\' does not exist', 'InvalidStateError');
		if (!transaction._data[storeName].indexes[indexName]) throw new DOMException('IDBIndex.count(): Index \'' + indexName + '\' does not exist', 'InvalidStateError');

		// Return an IDBRequest on the transaction returns the count from a cursor.
		return transaction._request(index, function (request) {

			// Check state.
			if (transaction._finished) throw new DOMException('IDBIndex.count(): Transaction has finished', 'InvalidStateError');
			if (!transaction._data[storeName]) throw new DOMException('IDBIndex.count(): Object store \'' + storeName + '\' does not exist', 'InvalidStateError');
			if (!transaction._data[storeName].indexes[indexName]) throw new DOMException('IDBIndex.count(): Index \'' + indexName + '\' does not exist', 'InvalidStateError');

			// Return the number of keys found on the cursor.
			return new IDBCursor(request, key)._count;
		});
	}

	// Get a single result.
	// Returns a request that fires a 'success' event when its result is available.
	// `request.result` will be either:
	// 1. The value for the first result with a key matching `key`.
	// 2. `undefined`, if there are no matching results.
	function get() {
		var key = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : undefined;

		// Check params.
		if (!validKey(key) && !validKeyRange(key) && key !== undefined) throw new DOMException('count(): The key parameter was provided but does not contain a valid key (number, string, date), key range (IDBKeyRange or array of valid keys), or undefined', 'DataError');

		// Check state.
		if (transaction._finished) throw new DOMException('IDBIndex.get(): Transaction has finished', 'InvalidStateError');
		if (!transaction._data[storeName]) throw new DOMException('IDBIndex.get(): Object store \'' + storeName + '\' does not exist', 'InvalidStateError');
		if (!transaction._data[storeName].indexes[indexName]) throw new DOMException('IDBIndex.get(): Index \'' + indexName + '\' does not exist', 'InvalidStateError');

		// Return an IDBRequest on the transaction.
		return transaction._request(index, function (request) {

			// Check state.
			if (transaction._finished) throw new DOMException('IDBIndex.get(): Transaction has finished', 'InvalidStateError');
			if (!transaction._data[storeName]) throw new DOMException('IDBIndex.get(): Object store \'' + storeName + '\' does not exist', 'InvalidStateError');
			if (!transaction._data[storeName].indexes[indexName]) throw new DOMException('IDBIndex.get(): Index \'' + indexName + '\' does not exist', 'InvalidStateError');

			// Return the value of the first key found by the cursor.
			return new IDBCursorWithValue(request, key).value;
		});
	}

	// Open a cursor to retrieve several results.
	// Returns a request that fires one or more 'success' events when its results is available.
	// Continues to fire 'success' as many times as `cursor.continue()` is called and results are available.
	// request.result will be either:
	// 1. An `IDBCursor` (with `cursor.value` and `cursor.key` to read values, and `cursor.continue()` method to continue).
	// 2. `undefined`, if there are no more results.
	function openCursor() {
		var query = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : undefined;
		var direction = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'next';

		// Check params.
		if (!validKey(query) && !validKeyRange(query) && query !== undefined) throw new DOMException('count(): The query parameter was provided but does not contain a valid key (number, string, date), key range (IDBKeyRange or array of valid keys), or undefined', 'DataError');
		if (direction !== 'next' && direction !== 'nextunique' && direction !== 'prev' && direction !== 'prevunique') throw new TypeError('IDBCursor: direction must be one of \'next\', \'nextunique\', \'prev\', \'prevunique\'');

		// Check state.
		if (transaction._finished) throw new DOMException('IDBIndex.openCursor(): Transaction has finished', 'InvalidStateError');
		if (!transaction._data[storeName]) throw new DOMException('IDBIndex.openCursor(): Object store \'' + storeName + '\' does not exist', 'InvalidStateError');
		if (!transaction._data[storeName].indexes[indexName]) throw new DOMException('IDBIndex.openCursor(): Index \'' + indexName + '\' does not exist', 'InvalidStateError');

		// Return an IDBRequest.
		// The result of the request is an IDBCursor (if there's a value at the current cursor position),
		// or undefined (if there isn't, because we iterated past the end or there were no results).
		var cursor = void 0;
		return transaction._request(index, function (request) {

			// Check state.
			if (transaction._finished) throw new DOMException('IDBIndex.openCursor(): Transaction has finished', 'InvalidStateError');
			if (!transaction._data[storeName]) throw new DOMException('IDBIndex.openCursor(): Object store \'' + storeName + '\' does not exist', 'InvalidStateError');
			if (!transaction._data[storeName].indexes[indexName]) throw new DOMException('IDBIndex.openCursor(): Index \'' + indexName + '\' does not exist', 'InvalidStateError');

			// Make a cursor if it doesn't exist.
			// Don't create the cursor until the request is run.
			// (Otherwise records added by other requests between this request being created and it being run, won't be included.)
			if (!cursor) cursor = new IDBCursorWithValue(request, query, direction);

			// Return cursor if there is a value.
			return cursor.primaryKey !== undefined ? cursor : undefined;
		});
	}
};

// IDBCursor mock.


var IDBCursor =
// Construct.
function IDBCursor(request) {
	var range = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : undefined;
	var direction = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 'next';
	var withValue = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;

	_classCallCheck(this, IDBCursor);

	// Check params.
	if (!(request instanceof IDBRequest)) throw new TypeError('IDBCursor: request must be an IDBRequest');
	if (!(request.source instanceof IDBObjectStore) && !(request.source instanceof IDBIndex)) throw new TypeError('IDBCursor: request must have a source that must be an IDBObjectStore or an IDBIndex');
	if (direction !== 'next' && direction !== 'nextunique' && direction !== 'prev' && direction !== 'prevunique') throw new TypeError('IDBCursor: direction must be one of \'next\', \'nextunique\', \'prev\', \'prevunique\'');
	if (!validKey(range) && !validKeyRange(range) && range !== undefined) throw new TypeError('IDBCursor: range must be a valid key (string, number, date), key range (array, IDBKeyRange), or undefined');

	// Vars.
	var transaction = request.transaction;
	var source = request.source;
	var store = source instanceof IDBObjectStore ? source : source.objectStore;
	var storeName = store.name;
	var index = source instanceof IDBIndex ? source : null;
	var indexName = index ? index.name : null;

	// Check state.
	if (!transaction._data[storeName]) throw new DOMException('IDBCursor: Object store \'' + storeName + '\' does not exist', 'InvalidStateError');
	if (index && !transaction._data[storeName].indexes[indexName]) throw new DOMException('IDBCursor: Index \'' + indexName + '\' does not exist', 'InvalidStateError');

	// Vars.
	var keys = find(transaction._data[storeName].records);
	var value = undefined;
	var key = undefined;
	var primaryKey = undefined;

	// Properties.
	Object.defineProperty(this, 'request', { value: request, enumerable: true });
	Object.defineProperty(this, 'source', { value: source, enumerable: true });
	Object.defineProperty(this, 'direction', { value: direction, enumerable: true });
	Object.defineProperty(this, 'key', {
		enumerable: true,
		get: function get() {
			return key;
		},
		set: function set() {
			throw new Error('IDBCursor: key is read only');
		}
	});
	Object.defineProperty(this, 'primaryKey', {
		enumerable: true,
		get: function get() {
			return primaryKey;
		},
		set: function set() {
			throw new Error('IDBCursor: primaryKey is read only');
		}
	});
	if (withValue) Object.defineProperty(this, 'value', {
		enumerable: true,
		get: function get() {
			return value;
		},
		set: function set() {
			throw new Error('IDBCursor: value is read only');
		}
	});
	Object.defineProperty(this, '_count', { value: keys.length });

	// Go to the first key.
	progress();

	// Methods.
	Object.defineProperty(this, 'advance', { value: advance });
	Object.defineProperty(this, 'continue', { value: _continue });
	Object.defineProperty(this, 'continuePrimaryKey', { value: continuePrimaryKey });
	if (withValue) Object.defineProperty(this, 'delete', { value: _delete });
	if (withValue) Object.defineProperty(this, 'update', { value: update });

	// Lock it down.
	Object.freeze(this);

	// Functions.
	function progress() {
		// Set key, value, primaryKey
		if (keys.length) {
			// Get key and primaryKey from list.
			key = keys[0][0];
			primaryKey = keys[0][1];
			keys.shift();

			// Fill in the value if neccessary.possible.
			if (withValue) value = transaction._data[storeName].records.get(primaryKey);
		} else {
			key = undefined;
			primaryKey = undefined;
			value = undefined;
		}
	}

	// Sets the number times a cursor should move its position forward.
	function advance(count) {
		// Check params.
		if (typeof count !== 'number') throw new TypeError('advance(): count must be a number');
		if (count <= 0) throw new TypeError('advance(): count must be 1 or more');

		// Check state.
		if (!keys.length) throw new DOMException('advance(): Cursor has iterated past the end of the set', 'InvalidStateError');
		if (request.readyState !== 'done') throw new DOMException('advance(): Cursor is currently iterating', 'InvalidStateError');
		if (!transaction._data[storeName]) throw new DOMException('advance(): Object store \'' + storeName + '\' does not exist', 'InvalidStateError');

		// Move forward by count.
		for (var i = 0; i < count; i++) {
			progress();
		} // Run the request again.
		request._rerun();
	}

	// Continue on to the next one, or onto a specific one.
	function _continue() {
		var targetKey = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : undefined;

		// Check params.
		if (!validKey(targetKey) && !validKeyRange(targetKey) && targetKey !== undefined) throw new DOMException('continue(): targetKey must be a valid key (string, number, date), key range (array or IDBKeyRange), or undefined', 'DataError');

		// Check state.
		if (!primaryKey) throw new DOMException('continue(): Cursor has iterated past the end of the set', 'InvalidStateError');
		if (request.readyState !== 'done') throw new DOMException('continue(): Cursor is currently iterating', 'InvalidStateError');
		if (!transaction._data[storeName]) throw new DOMException('continue(): Object store \'' + storeName + '\' does not exist', 'InvalidStateError');

		// Move forward by one.
		progress();

		// If key is not null, continue to progress until we find key or reach the end.
		if (targetKey !== undefined) while (primaryKey !== undefined && !keyInRange(key, targetKey)) {
			progress();
		} // Run the request again.
		request._rerun();
	}

	// Continue on to the next one that matches
	function continuePrimaryKey(targetKey, targetPrimaryKey) {
		// Check params.
		if (!validKey(targetKey) && !validKeyRange(targetKey)) throw new DOMException('continuePrimaryKey(): targetKey must be a valid key (string, number, date) or key range (array or IDBKeyRange)', 'DataError');
		if (!validKey(targetPrimaryKey) && !validKeyRange(targetPrimaryKey)) throw new DOMException('continuePrimaryKey(): targetPrimaryKey must be a valid key (string, number, date) or key range (array or IDBKeyRange)', 'DataError');

		// Check state.
		if (!keys.length) throw new DOMException('continuePrimaryKey(): Cursor has iterated past the end of the set', 'InvalidStateError');
		if (request.readyState !== 'done') throw new DOMException('continuePrimaryKey(): Cursor is currently iterating', 'InvalidStateError');
		if (!transaction._data[storeName]) throw new DOMException('continuePrimaryKey(): Object store \'' + storeName + '\' does not exist', 'InvalidStateError');

		// Continue until we find a value that has the right key and primaryKey.
		while (primaryKey !== undefined && !keyInRange(key, targetKey) && !keyInRange(primaryKey, targetPrimaryKey)) {
			progress();
		} // Run the request again.
		request._rerun();
	}

	// Delete the current primary key.
	function _delete() {
		// Checks.
		if (primaryKey !== null) throw new DOMException('delete(): Cursor does not have a value', 'InvalidStateError');

		// Return a request from IDBObjectStore.delete().
		return store.delete(primaryKey);
	}

	// Update the current primary key.
	function update(value) {
		// Checks.
		if (primaryKey !== null) throw new DOMException('update(): Cursor does not have a value', 'InvalidStateError');

		// Return a request from IDBObjectStore.put().
		return store.put(value, primaryKey);
	}

	// Find matching keys.
	function find(records) {
		// Vars.
		var keys = [];

		// Source is index or object store?
		if (index) {
			// Index source.
			// Loop through records.
			var _iteratorNormalCompletion2 = true;
			var _didIteratorError2 = false;
			var _iteratorError2 = undefined;

			try {
				for (var _iterator2 = records[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
					var _step2$value = _slicedToArray(_step2.value, 2),
					    primary = _step2$value[0],
					    _value = _step2$value[1];

					// Get key at index.keyPath and filter.
					var _key = _value instanceof Object ? _value[index.keyPath] : undefined;
					if (range === undefined || keyInRange(_key, range)) keys.push([_key, primary]);
				}
			} catch (err) {
				_didIteratorError2 = true;
				_iteratorError2 = err;
			} finally {
				try {
					if (!_iteratorNormalCompletion2 && _iterator2.return) {
						_iterator2.return();
					}
				} finally {
					if (_didIteratorError2) {
						throw _iteratorError2;
					}
				}
			}
		} else {
			// Object store source.
			// Loop through records and filter.
			var _iteratorNormalCompletion3 = true;
			var _didIteratorError3 = false;
			var _iteratorError3 = undefined;

			try {
				for (var _iterator3 = records[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
					var _step3$value = _slicedToArray(_step3.value, 1),
					    primary = _step3$value[0];

					if (range === undefined || keyInRange(primary, range)) keys.push([primary, primary]);
				}
			} catch (err) {
				_didIteratorError3 = true;
				_iteratorError3 = err;
			} finally {
				try {
					if (!_iteratorNormalCompletion3 && _iterator3.return) {
						_iterator3.return();
					}
				} finally {
					if (_didIteratorError3) {
						throw _iteratorError3;
					}
				}
			}
		}

		// Sort the keys by key.
		var sortedKeys = keys.sort(function (a, b) {
			return IDBFactory.cmp(a[0], b[0]);
		});

		// Possibly remove duplicate keys.
		if (direction === 'nextunique' || direction === 'prevunique') for (var i = sortedKeys.length - 2; i >= 0; i--) {
			if (sortedKeys[i] === sortedKeys[i + 1]) sortedKeys.splice(i + 1, 1);
		} // Possibly reverse the keys.
		if (direction === 'prev' || direction === 'prevunique') sortedKeys.reverse();

		// Return.
		return sortedKeys;
	}
};

// IDBCursorWithValue mock.


var IDBCursorWithValue = function (_IDBCursor) {
	_inherits(IDBCursorWithValue, _IDBCursor);

	// Construct.
	function IDBCursorWithValue(request) {
		var range = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : undefined;
		var direction = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 'next';

		_classCallCheck(this, IDBCursorWithValue);

		// Super.
		return _possibleConstructorReturn(this, (IDBCursorWithValue.__proto__ || Object.getPrototypeOf(IDBCursorWithValue)).call(this, request, range, direction, true));
	}

	return IDBCursorWithValue;
}(IDBCursor);

// IDBKeyRange mock.


var IDBKeyRange =
// Construct.
function IDBKeyRange(lower, upper) {
	var lowerOpen = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
	var upperOpen = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;

	_classCallCheck(this, IDBKeyRange);

	// Checks.
	if (!validKey(lower) && lower !== undefined) throw new DOMException('IDBKeyRange: lower must be a valid key (string, number, date) or undefined', 'DataError');
	if (!validKey(upper) && upper !== undefined) throw new DOMException('IDBKeyRange: upper must be a valid key (string, number, date) or undefined', 'DataError');
	if (typeof lowerOpen !== 'boolean') throw new DOMException('IDBKeyRange: lowerOpen must be boolean', 'DataError');
	if (typeof upperOpen !== 'boolean') throw new DOMException('IDBKeyRange: upperOpen must be boolean', 'DataError');
	if (lower > upper) throw new DOMException('IDBKeyRange: lower must be lower than upper', 'DataError');

	// Properties.
	Object.defineProperty(this, 'lower', { value: lower, enumerable: true });
	Object.defineProperty(this, 'upper', { value: upper, enumerable: true });
	Object.defineProperty(this, 'lowerOpen', { value: lowerOpen, enumerable: true });
	Object.defineProperty(this, 'upperOpen', { value: upperOpen, enumerable: true });

	// Methods.
	Object.defineProperty(this, 'includes', { value: includes });

	// Lock it down.
	Object.freeze(this);

	// Whether or not the given value is included in this range.
	function includes(key) {
		// Checks.
		if (!validKey(key)) throw new DOMException('includes(): key must be a valid key (string, number, date)', 'DataError');

		// See if it's in the range.
		if (upper !== undefined) {
			if (upperOpen) {
				if (key >= upper) return false;
			} else {
				if (key > upper) return false;
			}
		}
		if (lower !== undefined) {
			if (lowerOpen) {
				if (key <= lower) return false;
			} else {
				if (key < lower) return false;
			}
		}
		return true;
	}
};

// Create a key range with upper/lower bounds (static).


IDBKeyRange.bound = function (lower, upper) {
	var lowerOpen = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
	var upperOpen = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;

	// Checks.
	if (!validKey(lower)) throw new DOMException('bound(): lower must be a valid key (string, number, date)', 'DataError');
	if (!validKey(upper)) throw new DOMException('bound(): upper must be a valid key (string, number, date)', 'DataError');
	if (typeof lowerOpen !== 'boolean') throw new DOMException('bound(): lowerOpen must be boolean', 'DataError');
	if (typeof upperOpen !== 'boolean') throw new DOMException('bound(): upperOpen must be boolean', 'DataError');
	if (lower > upper) throw new DOMException('bound(): lower must be lower than upper', 'DataError');

	// Make an IDBKeyRange and return it.
	return new IDBKeyRange(lower, upper, lowerOpen, upperOpen);
};

// Create a key range with a single key (static).
IDBKeyRange.only = function (value) {
	// Checks.
	if (!validKey(value)) throw new DOMException('only(): value must be a valid key (string, number, date)', 'DataError');

	// Make an IDBKeyRange and return it.
	return new IDBKeyRange(value, value, false, false);
};

// Create a key range with a lower bound but no upper bound (static).
IDBKeyRange.lowerBound = function (value) {
	var open = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

	// Checks.
	if (!validKey(value)) throw new DOMException('lowerBound(): value must be a valid key (string, number, date)', 'DataError');
	if (typeof open !== 'boolean') throw new DOMException('lowerBound(): open must be boolean', 'DataError');

	// Make an IDBKeyRange and return it.
	return new IDBKeyRange(value, undefined, open, true);
};

// Create a key range with an upper bound but no lower bound (static).
IDBKeyRange.upperBound = function (value) {
	var open = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

	// Checks.
	if (!validKey(value)) throw new DOMException('upperBound(): value must be a valid key (string, number, date)', 'DataError');
	if (typeof open !== 'boolean') throw new DOMException('upperBound(): open must be boolean', 'DataError');

	// Make an IDBKeyRange and return it.
	return new IDBKeyRange(undefined, value, true, open);
};

// IDBVersionChangeEvent mock.

var IDBVersionChangeEvent = function (_Event) {
	_inherits(IDBVersionChangeEvent, _Event);

	// Construct.
	function IDBVersionChangeEvent(name, oldVersion, newVersion) {
		_classCallCheck(this, IDBVersionChangeEvent);

		// Check.
		if (typeof name !== 'string') throw new TypeError('IDBVersionChangeEvent: name must be string');
		if (typeof oldVersion !== 'number' && oldVersion !== 0) throw new TypeError('IDBVersionChangeEvent: oldVersion must be number');
		if (typeof newVersion !== 'number') throw new TypeError('IDBVersionChangeEvent: newVersion must be number');

		// Super.

		// Public.
		var _this7 = _possibleConstructorReturn(this, (IDBVersionChangeEvent.__proto__ || Object.getPrototypeOf(IDBVersionChangeEvent)).call(this, name, { bubbles: false, cancelable: false }));

		Object.defineProperty(_this7, 'oldVersion', { value: oldVersion, enumerable: true });
		Object.defineProperty(_this7, 'newVersion', { value: newVersion, enumerable: true });

		// Lock it down.
		Object.freeze(_this7);
		return _this7;
	}

	return IDBVersionChangeEvent;
}(Event);

// DOMException mock.
// Name should be one of e.g. AbortError, ConstraintError, QuotaExceededError, UnknownError, NoError, VersionError


var DOMException = function (_Error) {
	_inherits(DOMException, _Error);

	// Construct.
	function DOMException() {
		var message = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';
		var name = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';

		_classCallCheck(this, DOMException);

		// Check.
		var _this8 = _possibleConstructorReturn(this, (DOMException.__proto__ || Object.getPrototypeOf(DOMException)).call(this, message));
		// Super.


		if (typeof name !== 'string') throw new TypeError('DOMException: name must be string');

		// Properties.
		Object.defineProperty(_this8, 'name', { value: name });

		// Lock it down.
		Object.freeze(_this8);
		return _this8;
	}

	return DOMException;
}(Error);

// Functions.

// Reset data.


function reset() {
	// Delete everything.
	for (var _key2 in connections) {
		delete connections[_key2];
	}for (var _key3 in versions) {
		delete versions[_key3];
	}for (var _key4 in storage) {
		delete storage[_key4];
	}
}

// Is the supplied identified a valid identifier?
var r_identifier = /^[a-z_][a-zA-Z0-9_\-\$]*$/;
function validIdentifier(identifier) {
	if (typeof identifier === 'string' && identifier.match(r_identifier)) return true;else return false;
}

// Is the supplied key a valid keyPath?
// e.g. 'id' or 'abc' or 'abc.def'
function validKeyPath(keyPath) {
	if (typeof keyPath === 'string') {
		// Can be either 'abc' or 'abc.def'.
		var keyPathParts = keyPath.split('.');
		for (var i = 0; i < keyPathParts.length; i++) {
			if (!validIdentifier(keyPathParts[i])) return false;
		}return true;
	} else return false;
}

// Is the supplied array an array of valid key paths?
// e.g. ['id', 'abc', 'abc.def']
function validMultiKeyPath(keyPath) {
	if (keyPath instanceof Array) {
		// An array of otherwise valid single key paths.
		if (keyPath.length < 1) return false;
		for (var i = 0; i < keyPath.length; i++) {
			if (!validKeyPath(keyPath[i])) return false;
		}return true;
	} else return false;
}

// Valid version number.
function validVersion(version) {
	// Must be a round finite number that's more than 1.
	if (typeof version === 'number' && version > 0 && isFinite(version) && version === Math.round(version)) return true;else return false;
}

// Is the supplied key a valid key?
function validKey(key) {
	// Simple keys.
	if (typeof key === 'number' && isFinite(key)) return true;else if (typeof key === 'string') return true;else if (key instanceof Date) return true;
	return false;
}

// Is the supplied key a valid key range?
function validKeyRange(key) {
	if (key instanceof Array) {
		if (key.length < 1) return false;
		for (var i = 0; i < key.length; i++) {
			if (!validKey(key[i]) && !validKeyRange(key[i])) return false;
		}return true;
	}
	if (key instanceof IDBKeyRange) return true;
	return false;
}

// Is the key in the key range?
function keyInRange(key, range) {
	// Primitive ranges use simple comparisons.
	if (typeof range === 'number' || typeof range === 'string') return key === range;

	// Array ranges just test existance.
	if (range instanceof Array) {
		for (var i = 0; i < range.length; i++) {
			if (keyInRange(key, range[i])) return true;
		}return false;
	}

	// IDBKeyRanges test the key being inside the higher and lower range.
	if (range instanceof IDBKeyRange) return range.includes(key);

	// Anything else is false.
	return false;
}

// Deep clone a value.
function clone(value) {
	// Switch on type.
	if (value instanceof Array) {
		// Don't work on non-plain arrays.
		if (value.constructor !== Array) throw new Error('clone() can only clone plain arrays');

		// Quickly deep clone plain arrays by recursively calling clone() via map()
		return value.map(clone);
	} else if (value instanceof Object) {
		// Don't work on non-plain objects.
		if (value.constructor !== Object) throw new Error('clone() can only clone plain objects');

		// Deep clone the object.
		var cloned = {};
		for (var i in value) {
			cloned[i] = clone(value[i]);
		}return cloned;
	} else if (typeof value === 'number') {
		// Finite numbers only.
		// Things like Infinity and NaN are not
		if (!isFinite(value)) throw new Error('clone() cannot clone non-finite number');

		// No need to clone primative numbers.
		return value;
	} else if (typeof value === 'string' || typeof value === 'boolean' || value === null) {
		// No need to clone primitive strings, booleans, or null.
		return value;
	} else {
		// Don't work with undefined.
		throw new Error('clone() can only clone JSON-friendly values (null, true, false, string, finite number, plain object, plain array)');
	}
}

// Exports.
module.exports.IDBFactory = IDBFactory;
module.exports.IDBDatabase = IDBDatabase;
module.exports.IDBTransaction = IDBTransaction;
module.exports.IDBRequest = IDBRequest;
module.exports.IDBOpenDBRequest = IDBOpenDBRequest;
module.exports.IDBObjectStore = IDBObjectStore;
module.exports.IDBIndex = IDBIndex;
module.exports.IDBCursor = IDBCursor;
module.exports.IDBCursorWithValue = IDBCursorWithValue;
module.exports.IDBKeyRange = IDBKeyRange;
module.exports.IDBVersionChangeEvent = IDBVersionChangeEvent;
module.exports.DOMException = DOMException;
module.exports.validIdentifier = validIdentifier;
module.exports.validKeyPath = validKeyPath;
module.exports.validMultiKeyPath = validMultiKeyPath;
module.exports.validVersion = validVersion;
module.exports.validKey = validKey;
module.exports.validKeyRange = validKeyRange;
module.exports.keyInRange = keyInRange;
module.exports.clone = clone;
module.exports.reset = reset;