var sax = require('sax'),
    when = require('when'),
    http = require('http'),
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
  stream._write = function(chunk, enc, next) {
    var pos = 0;
    if (chunk.length > size) {
      var go;
      go = function() {
        to.write(chunk.slice(pos, pos + size > chunk.length ? chunk.length - 1 : pos + size));
        pos += size;
        if (pos >= chunk.length) {
          chunkDone(next);
        } else {
          chunkDone(go);
        }
      }
      go();
    } else {
      to.write(chunk);
      chunkDone(next);
    }
  };

  stream.end = function() {
    to.end();
  }

  from.pipe(stream);
}

module.exports = function(config) {
  var cfg = config || {},
      strict = cfg.strict || true,
      icase = cfg.icase || true,
      pojo = cfg.pojo || false,
      chunkSize = cfg.chunk || 8196;

  return function(xml, pattern, cb) {
    var stream = sax.createStream(strict, cfg);
    var stack = [];
    var path = [];
    var matcher = [];
    var childMatcher = [];
    var defer;
    var after;
    var collection = [];

    if (typeof pattern === 'string') {
      matcher.push(new RegExp('^' + pattern.replace(/\/\//, '\\/.*?') + '$', icase || !strict ? 'i' : ''));
      childMatcher.push(new RegExp('^' + pattern.replace(/\/\//, '\\/.*?') + '/', icase || !strict ? 'i' : ''));
    } else if (Array.isArray(pattern)) {
      for (var i = 0; i < pattern.length; i++) {
        var pat = pattern[i];

        matcher.push(new RegExp('^' + pat.replace(/\/\//, '\\/.*?') + '$', icase || !strict ? 'i' : ''));
        childMatcher.push(new RegExp('^' + pat.replace(/\/\//, '\\/.*?') + '/', icase || !strict ? 'i' : ''));
      }
    } else throw 'Invalid pattern.';

    // if callback has a done function, wait until it is called to proceeds
    var waiting = fired = 0;
    var shouldWait = !!!cb ? false : cb.length > 1;
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

    if (!!!cb) { defer = when.defer(); }
    else after = { onEnd: function(fn) { after.callback = fn; } };

    function current() {
      if (stack.length > 0) return stack[stack.length - 1];
      else return null;
    }

    stream.on('error', function(e) {
      this._parser.error = null;
      this._parser.resume();
    });

    stream.on('opentag', function(node) {
      // keep path current
      path.push(node.name);

      stack.push(node);
    });

    stream.on('closetag', function(name) {
      var loc = '/' + path.join('/');
      path.pop();
      var n = pojo ? { object: buildPojo(stack.pop()), name: name } : build(stack.pop());
      var p = current();

      // is this a child of a node we're looking for?
      for (var i = 0; i < childMatcher.length; i++) {
        if (!!loc.match(childMatcher[i]) && !!p) {
          if (!pojo) {
            if (safe(name) && !p.hasOwnProperty(name)) p[name] = n;
          }

          if (!!!p.children) p.children = [n];
          else p.children.push(n);

          // make sure we don't match more than one pattern
          break;
        }
      }

      // is this a node we're looking for? 
      for (var i = 0; i < matcher.length; i++) {
        if (!!loc.match(matcher[i])) {
          if (!!cb) {
            if (shouldWait) {
              waiting++;
              cb(pojo ? n.object : n, resume);
            } else cb(pojo ? n.object : n);
          }
          else collection.push(pojo ? n.object : n);

          // make sure we don't match more than one pattern
          break;
        }
      }
    });

    stream.on('text', function(txt) {
      // add text to current
      var n = current();
      if (!!n) {
        if (!!!n.text) n.text = txt;
        else n.text += txt;
      }
    });

    stream.on('end', function() {
      if (shouldWait) {
        if (!!after.callback && typeof after.callback === 'function') waitingTo = after.callback;
      } else {
        if (!!!cb) defer.resolve(collection);
        else if (!!after.callback && typeof after.callback === 'function') setImmediate(after.callback);
      }
      resume();
    });

    if (typeof xml === 'string') {
      if (xml.indexOf('http://') === 0 || xml.indexOf('https://') === 0) {
        http.get(xml, function(res) { chunkStream(chunkSize, res, stream, waitToDo); }).on('error', function(err) {
          if (!!!cb) defer.reject(err);
        });
      } else if (xml.indexOf('file://') === 0) {
        var pth = xml.substring(7);
        chunkStream(chunkSize, fs.createReadStream(pth), stream, waitToDo);
      } else {
        var read = require('stream').Readable();
        read._read = function() { read.push(xml); read.push(null); }
        chunkStream(chunkSize, read, stream, waitToDo);
      }
    } else if (!!xml && typeof xml === 'object' && typeof xml.pipe === 'function') {
      chunkStream(chunkSize, xml, stream, waitToDo);
    } else {
      stream._parser.close();
      throw "Unknown input format."
    }

    if (!!!cb) return defer.promise;
    else return after;
  };
};
