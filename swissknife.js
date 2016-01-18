(function (global, factory) {
  if (typeof define === "function" && define.amd) {
    define(['module'], factory);
  } else if (typeof exports !== "undefined") {
    factory(module);
  } else {
    var mod = {
      exports: {}
    };
    factory(mod);
    global.swissknife = mod.exports;
  }
})(this, function (module) {
  'use strict';

  var _typeof = typeof Symbol === "function" && _typeof(Symbol.iterator) === "symbol" ? function (obj) {
    return typeof obj === 'undefined' ? 'undefined' : _typeof(obj);
  } : function (obj) {
    return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj === 'undefined' ? 'undefined' : _typeof(obj);
  };

  function _defineProperty(obj, key, value) {
    if (key in obj) {
      Object.defineProperty(obj, key, {
        value: value,
        enumerable: true,
        configurable: true,
        writable: true
      });
    } else {
      obj[key] = value;
    }

    return obj;
  }

  var _extends = Object.assign || function (target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];

      for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          target[key] = source[key];
        }
      }
    }

    return target;
  };

  function _then(promise, transform) {
    var cancel = promise.cancel;
    var events = promise.events;
    return _extends(promise.then(transform), {
      cancel: cancel,
      events: events
    }, {
      then: function then(transform) {
        return _then(this, transform);
      }
    });
  }

  function EventEmitter() {
    var listeners = {};

    this.on = function (event, cb) {
      listeners[event] = (listeners[event] || []).concat([cb]);
      return this;
    };

    this.off = function (event, cb) {
      listeners[event] = (listeners[event] || []).filter(function (listener) {
        return listener !== cb;
      });
      return this;
    };

    this.emit = function (event) {
      for (var _len = arguments.length, data = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
        data[_key - 1] = arguments[_key];
      }

      if (listeners[event]) {
        listeners[event].forEach(function (cb) {
          return cb.apply(undefined, data);
        });
      }

      return this;
    };

    this.addEventListener = this.on;
    this.removeEventListener = this.off;
  }

  function identity(arg) {
    return arg;
  }

  function normalizeToPromise(promizable, ctx, next) {
    if (promizable instanceof Function) {
      promizable = promizable(ctx, next);
    }

    if (!promizable instanceof Promise) {
      return Promise.resolve(promizable);
    } else {
      return promizable;
    }
  }

  function wait(ms) {
    return function (value) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          return resolve(value);
        }, ms);
      });
    };
  }

  module.exports = {
    tasks: {
      middlewares: function middlewares(tasks) {
        return tasks.slice().reverse().reduce(function (next, fn) {
          return function (ctx) {
            return _extends(new Promise(function (res) {
              return res(normalizeToPromise(fn, ctx, next));
            }), {
              on: ctx.on
            });
          };
        }, identity);
      },
      chain: function chain(tasks) {
        return function executeTasks(ctx) {
          return tasks.reduce(function (lastRes, fn) {
            return lastRes.then(normalizeToPromise.bind(null, fn));
          }, Promise.resolve(ctx));
        };
      },
      all: function all(tasks) {
        var keys = Object.keys(tasks);
        return function executeTasks(ctx) {
          return Promise.all(keys.map(function (k) {
            return normalizeToPromise(tasks[k], ctx);
          })).then(function (results) {
            return keys.reduce(function (memo, k, index) {
              return _extends(memo, _defineProperty({}, k, results[index]));
            }, {});
          });
        };
      },
      retry: function retry() {
        var _ref = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

        var task = _ref.task;
        var ctx = _ref.ctx;
        var _ref$delay = _ref.delay;
        var delay = _ref$delay === undefined ? function (cpt) {
          return 0;
        } : _ref$delay;
        var _ref$isRetryable = _ref.isRetryable;
        var isRetryable = _ref$isRetryable === undefined ? function (err) {
          return true;
        } : _ref$isRetryable;
        var _ref$maxRetry = _ref.maxRetry;
        var maxRetry = _ref$maxRetry === undefined ? 5 : _ref$maxRetry;

        function tryTask() {
          var retryCpt = arguments.length <= 0 || arguments[0] === undefined ? 1 : arguments[0];
          return task(ctx).catch(function (err) {
            if (isRetryable(err) && retryCpt < maxRetry) {
              return wait(retryCpt ? delay(retryCpt) : 0)().then(function () {
                return tryTask(retryCpt + 1);
              });
            } else {
              throw err;
            }
          });
        }

        return tryTask();
      }
    },
    collection: {
      map: function map(collection, task) {
        var _ref3;

        var _ref2 = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

        var _ref2$limit = _ref2.limit;
        var limit = _ref2$limit === undefined ? 5 : _ref2$limit;
        var events = new EventEmitter();
        var iterator = collection[Symbol.iterator]();
        var activeTasksCpt = 0;
        var queue = [];
        var index = 0;

        var enqueue = function enqueue() {
          var element = iterator.next();
          var currentIndex = index = index + 1;

          if (element.done === false) {
            var _ret = function () {
              var promise = new Promise(function (resolve) {
                if (activeTasksCpt < limit) {
                  activeTasksCpt++;
                  resolve();
                } else {
                  queue.push(resolve);
                }
              });
              promise = _then(promise, function () {
                var result = task(element.value);
                events.emit('start', {
                  index: currentIndex,
                  promise: result
                });
                return result;
              }).then(function (res) {
                events.emit('end', {
                  index: currentIndex,
                  promise: promise
                });

                var next = queue.shift() || function () {
                  activeTasksCpt--;
                };

                next();
                return res;
              });
              return {
                v: {
                  value: promise,
                  done: false
                }
              };
            }();

            if ((typeof _ret === 'undefined' ? 'undefined' : _typeof(_ret)) === "object") return _ret.v;
          } else {
            return {
              done: true
            };
          }
        };

        return _ref3 = {}, _defineProperty(_ref3, Symbol.iterator, function () {
          return {
            next: enqueue
          };
        }), _defineProperty(_ref3, 'all', function all() {
          return Promise.all(this);
        }), _defineProperty(_ref3, 'events', events), _ref3;
      }
    }
  };
});
