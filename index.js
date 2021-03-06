var sax = require('sax'),
    http = require('http'),
    https = require('https'),
    fs = require('fs'),
    writable = require('stream').Writable;

var reserved = ['attributes', 'children', 'tagName', 'text'];

function safe(name) { return reserved.indexOf(name) < 0; }

function build(from) {
  var res = {};
  var children = from.children || [];
  res.children = children;
  res.attributes = from.attributes;
  res.tagName = from.name;
  res.text = from.text;

  var attrs = res.attributes;
  for (var attr in attrs) if (safe(attr)) res[attr] = attrs[attr];
  for (var i in children) {
    var child = children[i];
    if (!res.hasOwnProperty(child.tagName) && safe(child.tagName)) res[child.tagName] = child;
  }

  return res;
}

function setProp(dest, name, value) {
  if (dest.hasOwnProperty(name)) {
    if (Array.isArray(dest[name])) dest[name].push(value);
    else dest[name] = [dest[name], value];
  } else dest[name] = value;
}

function buildPojo(from) {
  var res = {};

  var attrs = from.attributes || {};
  var children = from.children || [];

  // if this has no children or attributes, just return text if it's available
  if (JSON.stringify(attrs) === '{}' && children.length === 0 && !!from.text)
    return from.text;
  else
    if (!!from.text) res.text = from.text;

  for (var a in attrs) setProp(res, a, attrs[a]);
  for (var c = 0; c < children.length; c++) setProp(res, children[c].name, children[c].object);

  return res;
}

function chunkStream(size, from, to, chunkDone) {
  var stream = writable();
  var pending = 0;
  var ended = false;

  stream._write = function(chunk, _enc, next) {
    pending++;

    function done() {
      pending--;
      next();
      if (ended) stream.end();
    }

    var pos = 0;
    if (chunk.length > size) {
      var go;
      go = function() {
        var sub = chunk.slice(pos, pos + size);
        to.write(sub);
        pos += sub.length;
        if (pos >= chunk.length) {
          chunkDone(done);
        } else {
          chunkDone(go);
        }
      };
      go();
    } else {
      to.write(chunk);
      chunkDone(done);
    }
  };

  stream.end = function() {
    ended = true;
    if (!pending) to.end();
  };

  from.pipe(stream);
}

module.exports = function(config) {
  var cfg = config || {},
      strict = cfg.strict === undefined ? true : cfg.strict,
      icase = cfg.icase || true,
      pojo = cfg.pojo || false,
      chunkSize = cfg.chunk || 8196;

  return function(xml, pattern, cb) {
    var stream = sax.createStream(strict, cfg);
    var stack = [];
    var path = [];
    var matcher = [];
    var levels = [];
    var defer;
    var promise;
    var after;
    var collection = [];
    var cdata;

    if (typeof pattern === 'string') {
      matcher.push(new RegExp('^' + pattern.replace(/\/\//, '\\/.*?') + '$', icase || !strict ? 'i' : ''));
    } else if (Array.isArray(pattern)) {
      for (var i = 0; i < pattern.length; i++) {
        matcher.push(new RegExp('^' + pattern[i].replace(/\/\//, '\\/.*?') + '$', icase || !strict ? 'i' : ''));
      }
    } else throw 'Invalid pattern.';

    // if callback has a done function, wait until it is called to proceeds
    var waiting = 0, fired = 0;
    var shouldWait = !cb ? false : cb.length > 1;
    var waitingTo;

    function waitToDo(fn) {
      if (shouldWait && fired < waiting) {
        if (!!waitingTo) console.error('overwriting waitFn!!!');
        waitingTo = fn;
      } else {
        setImmediate(fn);
      }
    }

    function resume() {
      fired++;
      if (waiting <= fired) {
        if (!!waitingTo) setImmediate(waitingTo);
        waitingTo = null;
      }
    }

    if (!cb) {
      promise = new Promise(function(ok, fail) {
        defer = { resolve: ok, reject: fail };
      });
    } else after = { onEnd: function(fn) { after.callback = fn; } };

    stream.on('error', function() {
      this._parser.error = null;
      this._parser.resume();
    });

    stream.on('opentag', function(node) {
      // keep path current
      path.push(node.name);

      stack.unshift(node);

      var loc = '/' + path.join('/');
      // is this a child of a node we're looking for?
      if (levels[0]) levels.unshift(2);
      else levels.unshift(0);

      // is this a node we're looking for?
      for (i = 0; i < matcher.length; i++) {
        if (!!loc.match(matcher[i])) {
          levels[0] = 1;
          break;
        }
      }
    });

    stream.on('closetag', function(name) {
      path.pop();
      var n = pojo ? { object: buildPojo(stack.shift()), name: name } : build(stack.shift());
      var p = stack[0];
      var level = levels.shift();

      // is this a child of a node we're looking for?
      if (level === 2 && !!p) {
        if (!pojo) {
          if (safe(name) && !p.hasOwnProperty(name)) p[name] = n;
        }

        if (!p.children) p.children = [n];
        else p.children.push(n);
      }

      // is this a node we're looking for?
      if (level === 1) {
        if (!!cb) {
          if (shouldWait) {
            waiting++;
            cb(pojo ? n.object : n, resume);
          } else cb(pojo ? n.object : n);
        } else collection.push(pojo ? n.object : n);
      }
    });

    stream.on('text', function(txt) {
      if (!levels[0]) return;
      // add text to current
      var n = stack[0];
      if (!!n) {
        if (!n.text) n.text = txt;
        else n.text += txt;
      }
    });

    stream.on('opencdata', function() {
      cdata = '';
    });

    stream.on('cdata', function(txt) {
      cdata += txt;
    });

    stream.on('closecdata', function() {
      if (!levels[0]) return;
      // add text to current
      var n = stack[0];
      if (!!n) {
        if (!n.text) n.text = cdata;
        else n.text += cdata;
      }
      cdata = '';
    });

    stream.on('end', function() {
      if (shouldWait) {
        if (!!after.callback && typeof after.callback === 'function') waitingTo = after.callback;
      } else {
        if (!cb) defer.resolve(collection);
        else if (!!after.callback && typeof after.callback === 'function') setImmediate(after.callback);
      }
    });

    if (typeof xml === 'string') {
      if (xml.indexOf('http://') === 0 || xml.indexOf('https://') === 0) {
        (xml.indexOf('https://') === 0 ? https : http).get(xml, function(res) { chunkStream(chunkSize, res, stream, waitToDo); }).on('error', function(err) {
          if (!cb) defer.reject(err);
        });
      } else if (xml.indexOf('file://') === 0) {
        var pth = xml.substring(7);
        chunkStream(chunkSize, fs.createReadStream(pth), stream, waitToDo);
      } else {
        var read = require('stream').Readable();
        var done = false;
        read._read = function() {
          if (done) return read.push(null);
          read.push(xml);
          done = true;
          return;
        };
        chunkStream(chunkSize, read, stream, waitToDo);
      }
    } else if (!!xml && typeof xml === 'object' && typeof xml.pipe === 'function') {
      chunkStream(chunkSize, xml, stream, waitToDo);
    } else {
      stream._parser.close();
      throw new Error("Unknown input format.");
    }

    if (!cb) return promise;
    else return after;
  };
};
