var sax = require('sax'),
    when = require('when'),
    http = require('http'),
    fs = require('fs');

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

module.exports = function(config) {
  var cfg = config || {},
      strict = cfg.strict || true,
      icase = cfg.icase || true,
      pojo = cfg.pojo || false;

  return function(xml, pattern, cb) {
    var stream = sax.createStream(strict, cfg);
    var stack = [];
    var path = [];
    var matcher = new RegExp('^' + pattern.replace(/\/\//, '\\/.*?') + '$', icase || !strict ? 'i' : '');
    var childMatcher = new RegExp('^' + pattern.replace(/\/\//, '\\/.*?') + '/', icase || !strict ? 'i' : '');
    var defer;
    var collection = [];

    if (!!!cb) { defer = when.defer(); }

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
      if (!!loc.match(childMatcher) && !!p) {
        if (!pojo) {
          if (safe(name) && !p.hasOwnProperty(name)) p[name] = n;
        }

        if (!!!p.children) p.children = [n];
        else p.children.push(n);
      }

      // is this a node we're looking for? 
      if (!!loc.match(matcher)) {
        if (!!cb) cb(pojo ? n.object : n);
        else collection.push(pojo ? n.object : n);
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
      if (!!!cb) defer.resolve(collection);
    });

    if (typeof xml === 'string') {
      if (xml.startsWith('http://') || xml.startsWith('https://')) {
        http.get(xml, function(res) { res.pipe(stream); }).on('error', function(err) {
          if (!!!cb) defer.reject(err);
        });
      } else if (xml.startsWith('file://')) {
        var pth = xml.substring(7);
        fs.createReadStream(pth).pipe(stream);
      } else {
        stream.write(xml);
        stream._parser.close();
      }
    } else if (!!xml && typeof xml === 'object' && typeof xml.pipe === 'function') {
      xml.pipe(stream);
    } else {
      stream._parser.close();
      throw "Unknown input format."
    }

    if (!!!cb) return defer.promise;
  };
};
