function identity(arg) {
  return arg;
}
function normalizeToPromise(promizable, ctx, next) {
  if (promizable instanceof Function) {
    promizable =  promizable(ctx, next);
  }
  if (!promizable instanceof Promise) {
    return Promise.resolve(promizable);
  } else {
    return promizable;
  }
}
function wait(ms) {
  return value => new Promise(function(resolve) {
    setTimeout(() => resolve(value), ms);
  });
}
module.exports = {
  tasks: {
    middlewares(tasks) {
      return tasks
        .slice().reverse()
        .reduce((next, fn) => ctx => Object.assign(new Promise(res => res(normalizeToPromise(fn, ctx, next))), { on: ctx.on }), identity);
    },
    chain(tasks) {
      return function executeTasks(ctx) {
        return tasks.reduce((lastRes, fn) => lastRes.then(normalizeToPromise.bind(null, fn)), Promise.resolve(ctx));
      }
    },
    // Tasks can be an array or a hash of {functions | values | promises}
     all(tasks) {
       var keys = Object.keys(tasks);
       return function executeTasks(ctx) {
         return Promise.all(keys.map(k => normalizeToPromise(tasks[k], ctx)))
           .then(results => keys
             .reduce((memo, k, index) => Object.assign(memo, { [k]: results[index] }), {})
           );
       }
     },
     retry({ task, ctx, delay = cpt => 0, isRetryable = err => true, maxRetry = 5 } = {}) {
       function tryTask(retryCpt = 1) {
         return task(ctx)
          .catch(err => {
            if (isRetryable(err) && retryCpt < maxRetry) {
              return wait(retryCpt ? delay(retryCpt) : 0)()
                .then(() => tryTask(retryCpt + 1));
            } else {
              throw err;
            }
          });
       }
       return tryTask();
     }
  },
  collection: {
    map (collection, task, { limit = 5, events = () => {} } = {}) {
      let memo = {};
      let iterator = collection[Symbol.iterator]();
      let activeTasksCpt = 0;
      let queue = [];
      let enqueue = function() {
        let element = iterator.next();
        if (element.done === false) {
          let promise = new Promise(resolve => {
            if (activeTasksCpt < limit) {
              activeTasksCpt++;
              resolve();
            } else {
              queue.push(resolve);
            }
          });
          promise = promise.then(() => task(element.value, events));
          promise
            .then(res => {
              let next = queue.shift() || (() => { activeTasksCpt-- });
              next();
              return res;
            });
          return { value: promise, done: false };
        } else {
          return { done: true };
        }
      }
      return { [Symbol.iterator]: () => ({ next: enqueue }) };
    }
  }
}
